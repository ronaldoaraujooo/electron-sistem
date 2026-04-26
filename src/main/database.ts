import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const dbDir = app.getPath('userData');
export const dbPath = path.join(dbDir, 'caixa.db'); // agora exportado
export const db: DatabaseType = new Database(dbPath);


// Cria tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nome_completo TEXT,
    role TEXT DEFAULT 'operador',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    token TEXT,
    inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    fim DATETIME,
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
  );
`);


// ... após criação de usuarios e sessoes
db.exec(`

  -- Fornecedores
  CREATE TABLE IF NOT EXISTS fornecedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    contato TEXT,
    telefone TEXT,
    email TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Categorias de produtos
  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    descricao TEXT
  );

  -- Produtos (agora com referências e campos expandidos)
  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria_id INTEGER,
    fornecedor_id INTEGER,
    codigo_barras TEXT,
    preco_custo REAL NOT NULL,
    preco_venda REAL NOT NULL,
    unidade_medida TEXT DEFAULT 'UN',
    quantidade_estoque INTEGER DEFAULT 0,
    estoque_minimo INTEGER DEFAULT 5,
    data_validade DATE,
    data_entrada DATE,
    quantidade_pack INTEGER DEFAULT 0,
    unidades_por_pack INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id),
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
  );

  -- Lotes (para controle de compras em pack com validade)
  CREATE TABLE IF NOT EXISTS lotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    fornecedor_id INTEGER,
    numero_lote TEXT,
    quantidade_inicial INTEGER NOT NULL,
    quantidade_atual INTEGER NOT NULL,
    preco_custo_unitario REAL NOT NULL,
    data_compra DATE,
    data_validade DATE,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos(id),
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
  );

  -- Movimentações de estoque (entradas/saídas)
  CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    lote_id INTEGER,
    tipo TEXT CHECK(tipo IN ('entrada', 'saida', 'ajuste')),
    quantidade INTEGER NOT NULL,
    motivo TEXT,
    usuario_id INTEGER,
    data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos(id),
    FOREIGN KEY (lote_id) REFERENCES lotes(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`);

// Migração: adiciona coluna role se não existir (para bancos antigos)
const tableInfo = db.prepare("PRAGMA table_info(usuarios)").all() as { name: string }[];
if (!tableInfo.some(col => col.name === 'role')) {
  db.exec("ALTER TABLE usuarios ADD COLUMN role TEXT DEFAULT 'operador'");
  // Define o usuário 'caixa' como admin
  db.exec("UPDATE usuarios SET role = 'admin' WHERE username = 'caixa'");
}

// Migração: adiciona colunas de packs e data_entrada se não existirem
const produtoTableInfo = db.prepare("PRAGMA table_info(produtos)").all() as { name: string }[];
if (!produtoTableInfo.some(col => col.name === 'data_entrada')) {
  db.exec("ALTER TABLE produtos ADD COLUMN data_entrada DATE");
}
if (!produtoTableInfo.some(col => col.name === 'quantidade_pack')) {
  db.exec("ALTER TABLE produtos ADD COLUMN quantidade_pack INTEGER DEFAULT 0");
}
if (!produtoTableInfo.some(col => col.name === 'unidades_por_pack')) {
  db.exec("ALTER TABLE produtos ADD COLUMN unidades_por_pack INTEGER DEFAULT 1");
}

// Insere usuário padrão se não existir
const stmt = db.prepare("SELECT COUNT(*) as count FROM usuarios WHERE username = 'caixa'");
const result = stmt.get() as { count: number };
if (result.count === 0) {
  db.prepare("INSERT INTO usuarios (username, password, nome_completo, role) VALUES (?, ?, ?, ?)")
    .run('caixa', 'caixa2026', 'Administrador', 'admin');
}