import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';
import path from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { db } from './database';
import jwt from 'jsonwebtoken';
import { dbPath } from './database';

const JWT_SECRET = 'seu-segredo-aqui';

// ========== Handlers IPC ==========
ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
  const user = db.prepare(`
    SELECT id, username, nome_completo, role 
    FROM usuarios 
    WHERE username = ? AND password = ?
  `).get(username, password) as { id: number; username: string; nome_completo: string; role: string } | undefined;

  if (!user) {
    return { success: false, error: 'Credenciais inválidas' };
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  db.prepare("INSERT INTO sessoes (usuario_id, token) VALUES (?, ?)").run(user.id, token);

  return {
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      nome: user.nome_completo,
      role: user.role,
    },
  };
});

ipcMain.handle('auth:verify', async (_event, token: string) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    const session = db.prepare("SELECT * FROM sessoes WHERE token = ? AND fim IS NULL").get(token);
    if (!session) throw new Error('Sessão inválida');
    const user = db.prepare("SELECT id, username, nome_completo, role FROM usuarios WHERE id = ?").get(decoded.userId) as { id: number; username: string; nome_completo: string; role: string };
    return { 
      valid: true, 
      user: {
        id: user.id,
        username: user.username,
        nome: user.nome_completo,
        role: user.role,
      }
    };
  } catch {
    return { valid: false };
  }
});

ipcMain.handle('auth:logout', async (_event, token: string) => {
  db.prepare("UPDATE sessoes SET fim = CURRENT_TIMESTAMP WHERE token = ?").run(token);
  return { success: true };
});

ipcMain.handle('auth:verifyMasterPassword', async (_event, senha: string) => {
  const MASTER_PASSWORD = 'caixa2026';
  return senha === MASTER_PASSWORD;
});

// Listar usuários (admin)
ipcMain.handle('usuarios:listar', async (_event, token: string) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  const usuarios = db.prepare("SELECT id, username, nome_completo, role, criado_em FROM usuarios").all();
  return { success: true, usuarios };
});

// Criar usuário (admin) – ainda precisa da senha mestra para confirmar
ipcMain.handle('usuarios:criar', async (_event, token: string, masterPassword: string, novoUsuario: { username: string; password: string; nome: string; role: string }) => {
  // Verificar se é admin
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  // Verificar senha mestra
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }
  try {
    db.prepare("INSERT INTO usuarios (username, password, nome_completo, role) VALUES (?, ?, ?, ?)")
      .run(novoUsuario.username, novoUsuario.password, novoUsuario.nome, novoUsuario.role);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db:getPath', async () => {
  return path.dirname(dbPath);
});

ipcMain.handle('db:openFolder', async (_event, folderPath: string) => {
  shell.openPath(folderPath);
});

// ========== Criação da Janela ==========
function createWindow(): void {
  // Cria a janela do navegador
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'), // Caminho para o preload compilado
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // Carrega a URL do renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Editar usuário
ipcMain.handle('usuarios:editar', async (_event, token: string, masterPassword: string, id: number, dados: { username?: string; password?: string; nome?: string; role?: string }) => {
  // Verificar admin
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }
  try {
    const fields: string[] = [];
    const values: any[] = [];
    if (dados.username) { fields.push('username = ?'); values.push(dados.username); }
    if (dados.password) { fields.push('password = ?'); values.push(dados.password); }
    if (dados.nome) { fields.push('nome_completo = ?'); values.push(dados.nome); }
    if (dados.role) { fields.push('role = ?'); values.push(dados.role); }
    if (fields.length === 0) return { success: false, error: 'Nenhum dado para atualizar' };
    values.push(id);
    db.prepare(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Excluir usuário
ipcMain.handle('usuarios:excluir', async (_event, token: string, masterPassword: string, id: number) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }
  // Impedir exclusão do admin padrão (id 1 ou username 'caixa')
  const user = db.prepare("SELECT username FROM usuarios WHERE id = ?").get(id) as { username: string };
  if (user?.username === 'caixa') {
    return { success: false, error: 'Não é permitido excluir o administrador padrão' };
  }
  try {
    db.prepare("DELETE FROM usuarios WHERE id = ?").run(id);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// ========== Produtos ==========

// Listar todos os produtos (qualquer usuário logado)
// ========== Produtos ==========

// Listar todos os produtos (qualquer usuário logado) – AGORA COM TODOS OS CAMPOS
ipcMain.handle('produtos:listar', async () => {
  try {
    const produtos = db.prepare(`
      SELECT 
        p.id, p.nome, p.descricao, p.codigo_barras,
        p.preco_custo, p.preco_venda, p.unidade_medida,
        p.quantidade_estoque, p.estoque_minimo, p.data_validade, p.data_entrada,
        p.quantidade_pack, p.unidades_por_pack, p.criado_em,
        c.id as categoria_id, c.nome as categoria_nome,
        f.id as fornecedor_id, f.nome as fornecedor_nome
      FROM produtos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
      ORDER BY p.nome
    `).all();
    return { success: true, produtos };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Criar produto (admin + senha mestra) – AGORA COM INSERT COMPLETO
ipcMain.handle('produtos:criar', async (_event, token: string, masterPassword: string, produto: {
  nome: string;
  descricao?: string;
  categoria_id?: number | null;
  fornecedor_id?: number | null;
  codigo_barras?: string;
  preco_custo: number;
  preco_venda: number;
  unidade_medida?: string;
  quantidade_estoque?: number;
  estoque_minimo?: number;
  data_validade?: string | null;
  data_entrada?: string | null;
  quantidade_pack?: number;
  unidades_por_pack?: number;
}) => {
  // Verificar admin
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO produtos (
        nome, descricao, categoria_id, fornecedor_id, codigo_barras,
        preco_custo, preco_venda, unidade_medida, quantidade_estoque,
        estoque_minimo, data_validade, data_entrada, quantidade_pack, unidades_por_pack
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      produto.nome,
      produto.descricao || null,
      produto.categoria_id || null,
      produto.fornecedor_id || null,
      produto.codigo_barras || null,
      produto.preco_custo,
      produto.preco_venda,
      produto.unidade_medida || 'UN',
      produto.quantidade_estoque || 0,
      produto.estoque_minimo || 5,
      produto.data_validade || null,
      produto.data_entrada || null,
      produto.quantidade_pack || 0,
      produto.unidades_por_pack || 1
    );
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Editar produto (admin + senha mestra) – AGORA COM TODOS OS CAMPOS EDITÁVEIS
ipcMain.handle('produtos:editar', async (_event, token: string, masterPassword: string, id: number, dados: {
  nome?: string;
  descricao?: string;
  categoria_id?: number | null;
  fornecedor_id?: number | null;
  codigo_barras?: string;
  preco_custo?: number;
  preco_venda?: number;
  unidade_medida?: string;
  quantidade_estoque?: number;
  estoque_minimo?: number;
  data_validade?: string | null;
  data_entrada?: string | null;
  quantidade_pack?: number;
  unidades_por_pack?: number;
}) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }

  try {
    const fields: string[] = [];
    const values: any[] = [];

    if (dados.nome !== undefined) { fields.push('nome = ?'); values.push(dados.nome); }
    if (dados.descricao !== undefined) { fields.push('descricao = ?'); values.push(dados.descricao); }
    if (dados.categoria_id !== undefined) { fields.push('categoria_id = ?'); values.push(dados.categoria_id); }
    if (dados.fornecedor_id !== undefined) { fields.push('fornecedor_id = ?'); values.push(dados.fornecedor_id); }
    if (dados.codigo_barras !== undefined) { fields.push('codigo_barras = ?'); values.push(dados.codigo_barras); }
    if (dados.preco_custo !== undefined) { fields.push('preco_custo = ?'); values.push(dados.preco_custo); }
    if (dados.preco_venda !== undefined) { fields.push('preco_venda = ?'); values.push(dados.preco_venda); }
    if (dados.unidade_medida !== undefined) { fields.push('unidade_medida = ?'); values.push(dados.unidade_medida); }
    if (dados.quantidade_estoque !== undefined) { fields.push('quantidade_estoque = ?'); values.push(dados.quantidade_estoque); }
    if (dados.estoque_minimo !== undefined) { fields.push('estoque_minimo = ?'); values.push(dados.estoque_minimo); }
    if (dados.data_validade !== undefined) { fields.push('data_validade = ?'); values.push(dados.data_validade); }
    if (dados.data_entrada !== undefined) { fields.push('data_entrada = ?'); values.push(dados.data_entrada); }
    if (dados.quantidade_pack !== undefined) { fields.push('quantidade_pack = ?'); values.push(dados.quantidade_pack); }
    if (dados.unidades_por_pack !== undefined) { fields.push('unidades_por_pack = ?'); values.push(dados.unidades_por_pack); }

    if (fields.length === 0) return { success: false, error: 'Nenhum dado para atualizar' };

    values.push(id);
    db.prepare(`UPDATE produtos SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Excluir produto (admin + senha mestra) - Cascata: deleta movimentações, lotes e produto
ipcMain.handle('produtos:excluir', async (_event, token: string, masterPassword: string, id: number) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }
  try {
    // Deletar em cascata:
    // 1. Deletar movimentações do produto
    db.prepare("DELETE FROM movimentacoes_estoque WHERE produto_id = ?").run(id);
    
    // 2. Deletar lotes do produto
    db.prepare("DELETE FROM lotes WHERE produto_id = ?").run(id);
    
    // 3. Deletar produto
    db.prepare("DELETE FROM produtos WHERE id = ?").run(id);
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// ========== Lotes e Movimentações ==========

// Registrar entrada de mercadoria (compra)
ipcMain.handle('lotes:criar', async (_event, token: string, masterPassword: string, dados: {
  produto_id: number;
  fornecedor_id?: number | null;
  numero_lote?: string;
  quantidade: number;
  preco_custo_unitario: number;
  data_compra?: string;
  data_validade?: string | null;
}) => {
  // Verificar admin
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }

  try {
    // Obter unidades_por_pack do produto
    const produto = db.prepare("SELECT unidades_por_pack FROM produtos WHERE id = ?").get(dados.produto_id) as { unidades_por_pack: number };
    const packsAdicionados = Math.floor(dados.quantidade / produto.unidades_por_pack);

    // Inserir lote
    const stmtLote = db.prepare(`
      INSERT INTO lotes (
        produto_id, fornecedor_id, numero_lote, quantidade_inicial,
        quantidade_atual, preco_custo_unitario, data_compra, data_validade
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmtLote.run(
      dados.produto_id,
      dados.fornecedor_id || null,
      dados.numero_lote || null,
      dados.quantidade,
      dados.quantidade,
      dados.preco_custo_unitario,
      dados.data_compra || new Date().toISOString().split('T')[0],
      dados.data_validade || null
    );
    const loteId = info.lastInsertRowid;

    // Atualizar quantidade_estoque e quantidade_pack do produto
    db.prepare("UPDATE produtos SET quantidade_estoque = quantidade_estoque + ?, quantidade_pack = quantidade_pack + ? WHERE id = ?")
      .run(dados.quantidade, packsAdicionados, dados.produto_id);

    // Registrar movimentação de entrada
    db.prepare(`
      INSERT INTO movimentacoes_estoque (produto_id, lote_id, tipo, quantidade, motivo)
      VALUES (?, ?, 'entrada', ?, ?)
    `).run(dados.produto_id, loteId, dados.quantidade, 'Compra registrada');

    return { success: true, loteId };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Listar lotes de um produto
ipcMain.handle('lotes:listarPorProduto', async (_event, produto_id: number) => {
  try {
    const lotes = db.prepare(`
      SELECT id, numero_lote, quantidade_atual, preco_custo_unitario, data_validade
      FROM lotes
      WHERE produto_id = ? AND quantidade_atual > 0
      ORDER BY data_validade ASC
    `).all(produto_id);
    return { success: true, lotes };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Registrar quebra/perda (ajuste de estoque negativo)
ipcMain.handle('estoque:ajustar', async (_event, token: string, masterPassword: string, dados: {
  produto_id: number;
  lote_id?: number | null;
  quantidade: number; // valor negativo para baixa
  motivo: string;
}) => {
  // Verificar admin
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }

  if (dados.quantidade >= 0) {
    return { success: false, error: 'A quantidade para ajuste de perda deve ser negativa' };
  }

  try {
    // Obter unidades_por_pack do produto
    const produto = db.prepare("SELECT unidades_por_pack FROM produtos WHERE id = ?").get(dados.produto_id) as { unidades_por_pack: number };
    const packsRemovidos = Math.floor(Math.abs(dados.quantidade) / produto.unidades_por_pack);

    // Atualizar estoque do produto
    db.prepare("UPDATE produtos SET quantidade_estoque = quantidade_estoque + ?, quantidade_pack = quantidade_pack - ? WHERE id = ?")
      .run(dados.quantidade, packsRemovidos, dados.produto_id);

    // Se um lote específico foi informado, atualizar quantidade_atual do lote
    if (dados.lote_id) {
      db.prepare("UPDATE lotes SET quantidade_atual = quantidade_atual + ? WHERE id = ?")
        .run(dados.quantidade, dados.lote_id);
    }

    // Registrar movimentação
    db.prepare(`
      INSERT INTO movimentacoes_estoque (produto_id, lote_id, tipo, quantidade, motivo)
      VALUES (?, ?, 'ajuste', ?, ?)
    `).run(dados.produto_id, dados.lote_id || null, dados.quantidade, dados.motivo);

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});


ipcMain.handle('categorias:editar', async (_event, token: string, masterPassword: string, id: number, dados: { nome?: string; descricao?: string }) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch { return { success: false, error: 'Não autorizado' }; }
  if (masterPassword !== 'caixa2026') return { success: false, error: 'Senha mestra incorreta' };
  try {
    const fields: string[] = [];
    const values: any[] = [];
    if (dados.nome !== undefined) { fields.push('nome = ?'); values.push(dados.nome); }
    if (dados.descricao !== undefined) { fields.push('descricao = ?'); values.push(dados.descricao); }
    if (fields.length === 0) return { success: false, error: 'Nenhum dado para atualizar' };
    values.push(id);
    db.prepare(`UPDATE categorias SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('categorias:excluir', async (_event, token: string, masterPassword: string, id: number) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch { return { success: false, error: 'Não autorizado' }; }
  if (masterPassword !== 'caixa2026') return { success: false, error: 'Senha mestra incorreta' };
  try {
    db.prepare("DELETE FROM categorias WHERE id = ?").run(id);
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('estoque:dadosGrafico', async () => {
  try {
    const totalEstoque = db.prepare(`
      SELECT SUM(quantidade_estoque * preco_custo) as valorTotal FROM produtos
    `).get() as { valorTotal: number };

    const totalPerdas = db.prepare(`
      SELECT ABS(SUM(quantidade)) as qtdPerda FROM movimentacoes_estoque WHERE tipo = 'ajuste'
    `).get() as { qtdPerda: number } || { qtdPerda: 0 };

    const totalUnidades = db.prepare(`
      SELECT SUM(quantidade_estoque) as totalUnid FROM produtos
    `).get() as { totalUnid: number };

    return {
    success: true,
    valorTotal: totalEstoque.valorTotal || 0,   // era valorTotalEstoque
    percentualPerda: totalUnidades.totalUnid ? ((totalPerdas.qtdPerda / totalUnidades.totalUnid) * 100).toFixed(1) : '0',
    quebras: totalPerdas.qtdPerda
  };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('estoque:ultimasPerdas', async (_event, limite: number = 10) => {
  try {
    const perdas = db.prepare(`
      SELECT m.id, p.nome AS produto_nome, l.numero_lote AS lote_numero,
             m.quantidade, m.motivo, m.data_movimentacao
      FROM movimentacoes_estoque m
      LEFT JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN lotes l ON m.lote_id = l.id
      WHERE m.tipo = 'ajuste'
      ORDER BY m.data_movimentacao DESC
      LIMIT ?
    `).all(limite);
    return { success: true, perdas };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Alertas: produtos abaixo do estoque mínimo ou vencendo em até X dias
ipcMain.handle('estoque:alertas', async (_event, dias_vencimento: number = 30) => {
  try {
    const baixoEstoque = db.prepare(`
      SELECT id, nome, quantidade_estoque, estoque_minimo
      FROM produtos
      WHERE quantidade_estoque < estoque_minimo
      ORDER BY (estoque_minimo - quantidade_estoque) DESC
    `).all();

    const proximoVencimento = db.prepare(`
      SELECT p.id, p.nome, NULL as numero_lote, p.quantidade_estoque as quantidade_atual, p.data_validade
      FROM produtos p
      WHERE p.data_validade IS NOT NULL
        AND date(p.data_validade) <= date('now', '+' || ? || ' days')
        AND p.quantidade_estoque > 0
      UNION
      SELECT p.id, p.nome, l.numero_lote, l.quantidade_atual, l.data_validade
      FROM lotes l
      JOIN produtos p ON l.produto_id = p.id
      WHERE l.data_validade IS NOT NULL
        AND date(l.data_validade) <= date('now', '+' || ? || ' days')
        AND l.quantidade_atual > 0
      ORDER BY data_validade ASC
    `).all(dias_vencimento, dias_vencimento);

    return { success: true, baixoEstoque, proximoVencimento };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// ========== Fornecedores ==========

ipcMain.handle('fornecedores:listar', async () => {
  try {
    const fornecedores = db.prepare("SELECT id, nome, contato, telefone, email FROM fornecedores ORDER BY nome").all();
    return { success: true, fornecedores };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fornecedores:criar', async (_event, token: string, masterPassword: string, fornecedor: { nome: string; contato?: string; telefone?: string; email?: string }) => {
  // Verificar admin
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }
  try {
    db.prepare("INSERT INTO fornecedores (nome, contato, telefone, email) VALUES (?, ?, ?, ?)")
      .run(fornecedor.nome, fornecedor.contato || null, fornecedor.telefone || null, fornecedor.email || null);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fornecedores:editar', async (_event, token: string, masterPassword: string, id: number, dados: { nome?: string; contato?: string; telefone?: string; email?: string }) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }
  try {
    const fields: string[] = [];
    const values: any[] = [];
    if (dados.nome !== undefined) { fields.push('nome = ?'); values.push(dados.nome); }
    if (dados.contato !== undefined) { fields.push('contato = ?'); values.push(dados.contato); }
    if (dados.telefone !== undefined) { fields.push('telefone = ?'); values.push(dados.telefone); }
    if (dados.email !== undefined) { fields.push('email = ?'); values.push(dados.email); }
    if (fields.length === 0) return { success: false, error: 'Nenhum dado para atualizar' };
    values.push(id);
    db.prepare(`UPDATE fornecedores SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fornecedores:excluir', async (_event, token: string, masterPassword: string, id: number) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }
  try {
    db.prepare("DELETE FROM fornecedores WHERE id = ?").run(id);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// ========== Categorias ==========

ipcMain.handle('categorias:listar', async () => {
  try {
    const categorias = db.prepare("SELECT id, nome, descricao FROM categorias ORDER BY nome").all();
    return { success: true, categorias };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('categorias:criar', async (_event, token: string, masterPassword: string, categoria: { nome: string; descricao?: string }) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    if (decoded.role !== 'admin') throw new Error('Acesso negado');
  } catch {
    return { success: false, error: 'Não autorizado' };
  }
  if (masterPassword !== 'caixa2026') {
    return { success: false, error: 'Senha mestra incorreta' };
  }
  try {
    db.prepare("INSERT INTO categorias (nome, descricao) VALUES (?, ?)")
      .run(categoria.nome, categoria.descricao || null);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// Editar e Excluir seguem o mesmo padrão (opcional, mas recomendado)

// ========== Inicialização ==========
app.whenReady().then(() => {
  // Configura o Electron App para melhor segurança
  electronApp.setAppUserModelId('com.seuapp.caixa');

  // Otimizações de desempenho
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
