import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAuthorization } from '../../hooks/useAuthorization';
import styles from './Estoque.module.css';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);
// Interfaces
interface Produto {
  id: number;
  nome: string;
  descricao: string | null;
  codigo_barras: string | null;
  preco_custo: number;
  preco_venda: number;
  unidade_medida: string;
  quantidade_estoque: number;
  estoque_minimo: number;
  data_validade: string | null;
  data_entrada: string | null;
  quantidade_pack: number;
  unidades_por_pack: number;
  categoria_id: number | null;
  categoria_nome: string | null;
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  criado_em: string;
  
}

interface Fornecedor {
  id: number;
  nome: string;
  contato?: string | null;
  telefone?: string | null;
  email?: string | null;
}

interface Categoria {
  id: number;
  nome: string;
  descricao?: string | null;
}

interface Lote {
  id: number;
  numero_lote: string | null;
  quantidade_atual: number;
  preco_custo_unitario: number;
  data_validade: string | null;
}

interface AlertaVencimento {
  id: number;
  nome: string;
  numero_lote: string | null;
  quantidade_atual: number;
  data_validade: string;
}

interface Perda {
  id: number;
  produto_nome: string;
  lote_numero: string | null;
  quantidade: number;
  motivo: string;
  data_movimentacao: string;
}

function Estoque() {
    const { token } = useAuth();
    const { isAdmin } = useAuthorization();

    // Estados principais
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [loading, setLoading] = useState(true);
    const [termoBusca, setTermoBusca] = useState('');
    const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'baixo' | 'vencendo'>('todos');

    // Estados de modais
    const [modalProduto, setModalProduto] = useState<{ open: boolean; editId?: number }>({ open: false });
    const [modalLote, setModalLote] = useState<{ open: boolean; produtoId?: number }>({ open: false });
    const [modalQuebra, setModalQuebra] = useState<{ open: boolean; produtoId?: number }>({ open: false });
    const [modalPerdas, setModalPerdas] = useState(false);
    const [modalDelete, setModalDelete] = useState<{ open: boolean; produtoId?: number; produtoNome?: string }>({ open: false });

    // Estados de formulário
    const [formProduto, setFormProduto] = useState<any>({});
    const [formLote, setFormLote] = useState<any>({});
    const [formQuebra, setFormQuebra] = useState<any>({ quantidade: 0, lote_id: '', motivo: '' });
    const [masterPassword, setMasterPassword] = useState('');
    const [submitLoading, setSubmitLoading] = useState(false);

    // Alertas (direita)
    const [alertasVencimento, setAlertasVencimento] = useState<AlertaVencimento[]>([]);
    const [ultimasPerdas, setUltimasPerdas] = useState<Perda[]>([]);

    // Dados do produto selecionado para ações
    const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
    const [lotesDoProduto, setLotesDoProduto] = useState<Lote[]>([]);

  // Modal Fornecedor
    const [modalFornecedor, setModalFornecedor] = useState<{ open: boolean; editId?: number }>({ open: false });
    const [formFornecedor, setFormFornecedor] = useState({ nome: '', contato: '', telefone: '', email: '' });
    const [listaFornecedores, setListaFornecedores] = useState<Fornecedor[]>([]);

    // Modal Categoria
    const [modalCategoria, setModalCategoria] = useState<{ open: boolean; editId?: number }>({ open: false });
    const [formCategoria, setFormCategoria] = useState({ nome: '', descricao: '' });
    const [listaCategorias, setListaCategorias] = useState<Categoria[]>([]);

    const [dadosGrafico, setDadosGrafico] = useState({ 
    valorTotalEstoque: 0,   // ou valorTotal, conforme escolher
    percentualPerda: '0', 
    quebras: 0 
    });

    useEffect(() => {
    window.electron.ipcRenderer.invoke('estoque:dadosGrafico')
        .then(res => { if (res.success) setDadosGrafico(res); });
    }, []);

  // Carregar dados iniciais
  useEffect(() => {
    carregarDados();
    carregarPerdas();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [resProd, resForn, resCat, resAlertas] = await Promise.all([
        window.electron.ipcRenderer.invoke('produtos:listar'),
        window.electron.ipcRenderer.invoke('fornecedores:listar'),
        window.electron.ipcRenderer.invoke('categorias:listar'),
        window.electron.ipcRenderer.invoke('estoque:alertas', 30)
      ]);
      if (resProd.success) setProdutos(resProd.produtos);
      if (resForn.success) setFornecedores(resForn.fornecedores);
      if (resCat.success) setCategorias(resCat.categorias);
      if (resAlertas.success) setAlertasVencimento(resAlertas.proximoVencimento);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const carregarPerdas = async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke('estoque:ultimasPerdas', 10);
      if (res.success) setUltimasPerdas(res.perdas);
    } catch (err) {
      console.error(err);
    }
  };

  // Atualizar lotes ao selecionar produto
  useEffect(() => {
    if (produtoSelecionado) {
      window.electron.ipcRenderer.invoke('lotes:listarPorProduto', produtoSelecionado.id)
        .then(res => { if (res.success) setLotesDoProduto(res.lotes); });
    }
  }, [produtoSelecionado]);

  // Filtragem local
  const produtosFiltrados = produtos.filter(p => {
    const matchBusca = p.nome.toLowerCase().includes(termoBusca.toLowerCase()) ||
                       (p.codigo_barras && p.codigo_barras.includes(termoBusca));
    if (!matchBusca) return false;
    if (filtroAtivo === 'baixo') return p.quantidade_estoque < p.estoque_minimo;
    if (filtroAtivo === 'vencendo') {
      return alertasVencimento.some(a => a.id === p.id);
    }
    return true;
  });

  // Handlers de ações
  const handleAddProduto = () => {
    setFormProduto({
      nome: '', descricao: '', codigo_barras: '', preco_custo: 0, preco_venda: 0,
      unidade_medida: 'UN', quantidade_estoque: 0, estoque_minimo: 5,
      categoria_id: '', fornecedor_id: '', data_validade: '', data_entrada: '',
      quantidade_pack: 0, unidades_por_pack: 1
    });
    setMasterPassword('');
    setModalProduto({ open: true });
  };

  const handleEditProduto = (prod: Produto) => {
    setFormProduto({
      nome: prod.nome, descricao: prod.descricao || '', codigo_barras: prod.codigo_barras || '',
      preco_custo: prod.preco_custo, preco_venda: prod.preco_venda, unidade_medida: prod.unidade_medida,
      quantidade_estoque: prod.quantidade_estoque, estoque_minimo: prod.estoque_minimo,
      categoria_id: prod.categoria_id || '', fornecedor_id: prod.fornecedor_id || '',
      data_validade: prod.data_validade || '', data_entrada: prod.data_entrada || '',
      quantidade_pack: prod.quantidade_pack, unidades_por_pack: prod.unidades_por_pack
    });
    setMasterPassword('');
    setModalProduto({ open: true, editId: prod.id });
  };

  const handleDeleteProduto = (produto: Produto) => {
    if (!isAdmin) return alert('Apenas administradores podem excluir produtos.');
    setModalDelete({ open: true, produtoId: produto.id, produtoNome: produto.nome });
  };

  const handleSubmitProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return alert('Ação restrita.');
    
    // Validar campos obrigatórios
    if (!formProduto.nome || formProduto.nome.trim() === '') {
      return alert('❌ O nome do produto é obrigatório!');
    }
    if (!formProduto.categoria_id || formProduto.categoria_id === '') {
      return alert('❌ Selecione uma categoria para o produto!\n\nA categoria é importante para rastreamento e organização.');
    }
    if (!formProduto.fornecedor_id || formProduto.fornecedor_id === '') {
      return alert('❌ Selecione um fornecedor!\n\nO fornecedor é importante para rastrear de onde o produto veio.');
    }
    if (!formProduto.preco_custo || Number(formProduto.preco_custo) <= 0) {
      return alert('❌ O preço de custo deve ser maior que zero!');
    }
    if (!formProduto.preco_venda || Number(formProduto.preco_venda) <= 0) {
      return alert('❌ O preço de venda deve ser maior que zero!');
    }
    
    setSubmitLoading(true);
    const dados = {
      ...formProduto,
      categoria_id: formProduto.categoria_id ? Number(formProduto.categoria_id) : null,
      fornecedor_id: formProduto.fornecedor_id ? Number(formProduto.fornecedor_id) : null,
      preco_custo: Number(formProduto.preco_custo),
      preco_venda: Number(formProduto.preco_venda),
      quantidade_estoque: Number(formProduto.quantidade_estoque),
      estoque_minimo: Number(formProduto.estoque_minimo),
      quantidade_pack: Number(formProduto.quantidade_pack),
      unidades_por_pack: Number(formProduto.unidades_por_pack)
    };
    const channel = modalProduto.editId ? 'produtos:editar' : 'produtos:criar';
    const payload = modalProduto.editId ? [token, masterPassword, modalProduto.editId, dados] : [token, masterPassword, dados];
    try {
      const res = await window.electron.ipcRenderer.invoke(channel, ...payload);
      if (res.success) {
        alert('✅ Produto salvo com sucesso!');
        setModalProduto({ open: false });
        carregarDados();
      } else {
        alert('❌ Erro: ' + res.error);
      }
    } catch (err) {
      alert('Erro na comunicação');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEntradaLote = (produto: Produto) => {
    setProdutoSelecionado(produto);
    setFormLote({
      fornecedor_id: produto.fornecedor_id || '',
      numero_lote: '',
      quantidade: 0,
      preco_custo_unitario: produto.preco_custo,
      data_compra: new Date().toISOString().split('T')[0],
      data_validade: ''
    });
    setMasterPassword('');
    setModalLote({ open: true, produtoId: produto.id });
  };

  const handleSubmitLote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return alert('Ação restrita.');
    setSubmitLoading(true);
    const dados = {
      produto_id: modalLote.produtoId!,
      fornecedor_id: formLote.fornecedor_id ? Number(formLote.fornecedor_id) : null,
      numero_lote: formLote.numero_lote,
      quantidade: Number(formLote.quantidade),
      preco_custo_unitario: Number(formLote.preco_custo_unitario),
      data_compra: formLote.data_compra,
      data_validade: formLote.data_validade || null
    };
    try {
      const res = await window.electron.ipcRenderer.invoke('lotes:criar', token, masterPassword, dados);
      if (res.success) {
        alert('Entrada registrada!');
        setModalLote({ open: false });
        carregarDados();
      } else {
        alert(res.error);
      }
    } catch (err) {
      alert('Erro');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Carregar listas para os modais de gestão
    const carregarFornecedores = async () => {
    const res = await window.electron.ipcRenderer.invoke('fornecedores:listar');
    if (res.success) setListaFornecedores(res.fornecedores);
    };
    const carregarCategorias = async () => {
    const res = await window.electron.ipcRenderer.invoke('categorias:listar');
    if (res.success) setListaCategorias(res.categorias);
    };

    // Handlers Fornecedor
    const handleAddFornecedor = () => {
    setFormFornecedor({ nome: '', contato: '', telefone: '', email: '' });
    setMasterPassword('');
    setModalFornecedor({ open: true });
    carregarFornecedores();
    };

    const handleEditFornecedor = (forn: Fornecedor) => {
    setFormFornecedor({ nome: forn.nome, contato: forn.contato || '', telefone: forn.telefone || '', email: forn.email || '' });
    setMasterPassword('');
    setModalFornecedor({ open: true, editId: forn.id });
    };

    const handleSubmitFornecedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return alert('Ação restrita.');
    if (!formFornecedor.nome.trim()) return alert('Nome obrigatório.');
    setSubmitLoading(true);
    const channel = modalFornecedor.editId ? 'fornecedores:editar' : 'fornecedores:criar';
    const payload = modalFornecedor.editId ? [token, masterPassword, modalFornecedor.editId, formFornecedor] : [token, masterPassword, formFornecedor];
    try {
        const res = await window.electron.ipcRenderer.invoke(channel, ...payload);
        if (res.success) {
        alert('Fornecedor salvo!');
        setModalFornecedor({ open: false });
        carregarFornecedores();
        carregarDados(); // atualiza selects nos modais de produto
        } else alert(res.error);
    } finally { setSubmitLoading(false); }
    };

    const handleDeleteFornecedor = async (id: number, nome: string) => {
    if (!confirm(`Excluir fornecedor "${nome}"?`)) return;
    const senha = prompt('Senha mestra:');
    if (!senha) return;
    const res = await window.electron.ipcRenderer.invoke('fornecedores:excluir', token, senha, id);
    if (res.success) { carregarFornecedores(); carregarDados(); } else alert(res.error);
    };

    // Handlers Categoria (similar)
    const handleAddCategoria = () => {
    setFormCategoria({ nome: '', descricao: '' });
    setMasterPassword('');
    setModalCategoria({ open: true });
    carregarCategorias();
    };

    const handleEditCategoria = (cat: Categoria) => {
    setFormCategoria({ nome: cat.nome, descricao: cat.descricao || '' });
    setMasterPassword('');
    setModalCategoria({ open: true, editId: cat.id });
    };

    const handleSubmitCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return alert('Ação restrita.');
    if (!formCategoria.nome.trim()) return alert('Nome obrigatório.');
    setSubmitLoading(true);
    const channel = modalCategoria.editId ? 'categorias:editar' : 'categorias:criar';
    const payload = modalCategoria.editId ? [token, masterPassword, modalCategoria.editId, formCategoria] : [token, masterPassword, formCategoria];
    try {
        const res = await window.electron.ipcRenderer.invoke(channel, ...payload);
        if (res.success) {
        alert('Categoria salva!');
        setModalCategoria({ open: false });
        carregarCategorias();
        carregarDados();
        } else alert(res.error);
    } finally { setSubmitLoading(false); }
    };

    const handleDeleteCategoria = async (id: number, nome: string) => {
        if (!confirm(`Excluir categoria "${nome}"?`)) return;
    const senha = prompt('Senha mestra:');
        if (!senha) return;
    const res = await window.electron.ipcRenderer.invoke('categorias:excluir', token, senha, id);
        if (res.success) { carregarCategorias(); carregarDados(); } else alert(res.error);
    };

  const handleQuebra = (produto: Produto) => {
    setProdutoSelecionado(produto);
    setFormQuebra({ quantidade: 0, lote_id: '', motivo: '' });
    setMasterPassword('');
    setModalQuebra({ open: true, produtoId: produto.id });
  };

  const handleSubmitQuebra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return alert('Ação restrita.');
    const qtd = Number(formQuebra.quantidade);
    if (qtd >= 0) return alert('Informe um valor negativo para perda.');
    setSubmitLoading(true);
    const dados = {
      produto_id: modalQuebra.produtoId!,
      lote_id: formQuebra.lote_id ? Number(formQuebra.lote_id) : null,
      quantidade: qtd,
      motivo: formQuebra.motivo
    };
    try {
      const res = await window.electron.ipcRenderer.invoke('estoque:ajustar', token, masterPassword, dados);
      if (res.success) {
        alert('Quebra registrada.');
        setModalQuebra({ open: false });
        carregarDados();
        carregarPerdas();
      } else {
        alert(res.error);
      }
    } catch (err) {
      alert('Erro');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSubmitDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalDelete.produtoId) return;
    setSubmitLoading(true);
    try {
      const res = await window.electron.ipcRenderer.invoke('produtos:excluir', token, masterPassword, modalDelete.produtoId);
      if (res.success) {
        alert('Produto excluído com sucesso!');
        setModalDelete({ open: false });
        carregarDados();
      } else {
        alert(res.error);
      }
    } catch (err) {
      alert('Erro na comunicação');
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading) return <div className={styles.loading}>Carregando...</div>;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.HeaderEstoque}>
        <a href="#/dashboard">Dashboard</a>
        <div className={styles.Pesquisar}>
          <input
            type="text"
            placeholder="Pesquisar produto..."
            value={termoBusca}
            onChange={e => setTermoBusca(e.target.value)}
          />
        </div>
        {isAdmin && (
          <div className={styles.AdicionarProduto}>
            <button onClick={handleAddProduto}>+ Adicionar Produto</button>
          </div>
        )}
        <div className={styles.RelatoriosGeral}>
          <button onClick={() => setFiltroAtivo('todos')}>Todos</button>
        </div>
        <div className={styles.RelatorioPesdas}>
          <button onClick={() => { setModalPerdas(true); carregarPerdas(); }}>Perdas</button>
        </div>
        <div className={styles.InfoUser}>
          {/* já temos no Dashboard, pode omitir ou mostrar resumo */}
        </div>
      </div>

      {/* Esquerda */}
      <div className={styles.Esquerda}>
        <div className={styles.MenuOpcoes}>
          {isAdmin && (
            <>
                <button onClick={handleAddProduto}>Adicionar produto</button>
                <button onClick={() => setFiltroAtivo('baixo')}>Produtos em falta</button>
                <button onClick={() => setFiltroAtivo('vencendo')}>Prestes a vencer</button>
                <button onClick={handleAddFornecedor}>Gerenciar Fornecedores</button>
                <button onClick={handleAddCategoria}>Gerenciar Categorias</button>
            </>
          )}
        </div>
        <div className={styles.ListaProdutos}>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Estoque (Un)</th>
                <th>Packs</th>
                <th>Preço Venda</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map(p => (
                <tr key={p.id} className={p.quantidade_estoque < p.estoque_minimo ? styles.alerta : ''}>
                  <td>{p.nome}</td>
                  <td>{p.quantidade_estoque}</td>
                  <td>{p.quantidade_pack} ({p.unidades_por_pack} un/pack)</td>
                  <td>R$ {p.preco_venda.toFixed(2)}</td>
                  <td>
                    {isAdmin && (
                      <>
                        <button onClick={() => handleEditProduto(p)}>Editar</button>
                        <button onClick={() => handleDeleteProduto(p)}>Excluir</button>
                        <button onClick={() => handleEntradaLote(p)}>Entrada</button>
                        <button onClick={() => handleQuebra(p)}>Quebra</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
      </div>

      {/* Direita */}
      <div className={styles.Direita}>
        <div className={styles.ListaVencidos}>
          <h4>Vencimento próximo (30d)</h4>
          <ul>
            {alertasVencimento.map(a => (
              <li key={a.id}>{a.nome} - Lote {a.numero_lote || 'N/A'} - {a.quantidade_atual} un. - Vence {new Date(a.data_validade).toLocaleDateString()}</li>
            ))}
          </ul>
        </div>
        <div className={styles.DiagramaDePerdas}>
          <h4>Últimas perdas</h4>
          {ultimasPerdas.length === 0 ? (
            <p>Nenhuma perda registrada.</p>
          ) : (
            <ul>
              {ultimasPerdas.slice(0, 5).map(perda => (
                <li key={perda.id}>
                  <strong>{perda.produto_nome}</strong> {perda.lote_numero ? `- Lote ${perda.lote_numero}` : ''}
                  <br />
                  {perda.quantidade} un. • {perda.motivo}
                  <br />
                  <small>{new Date(perda.data_movimentacao).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.graficoEstoque}>
            <div className={styles.PizzaGraf}>
                <Pie
                data={{
                    labels: ['Estoque Disponível', 'Perdas/Quebras'],
                    datasets: [{
                    data: [100 - Number(dadosGrafico.percentualPerda), Number(dadosGrafico.percentualPerda)],
                    backgroundColor: ['#2ecc71', '#e74c3c'],
                    borderWidth: 1
                    }]
                }}
                options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }}
                />
            </div>
            <div className={styles.DadosEstoque}>
                <p>Valor total em estoque: <strong>R$ {(dadosGrafico.valorTotalEstoque ?? 0).toFixed(2)}</strong></p>
                <p>Perdas: <strong>{dadosGrafico.percentualPerda}%</strong> ({dadosGrafico.quebras} unidades)</p>
            </div>
        </div>
      </div>

       {/* Modal Fornecedor */}
        {modalFornecedor.open && (
        <div className={styles.modalOverlay}>
            <div className={styles.modal}>
            <h3>{modalFornecedor.editId ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
            <form onSubmit={handleSubmitFornecedor}>
                <label>Nome *</label>
                <input value={formFornecedor.nome} onChange={e => setFormFornecedor({...formFornecedor, nome: e.target.value})} required />
                <label>Contato</label>
                <input value={formFornecedor.contato} onChange={e => setFormFornecedor({...formFornecedor, contato: e.target.value})} />
                <label>Telefone</label>
                <input value={formFornecedor.telefone} onChange={e => setFormFornecedor({...formFornecedor, telefone: e.target.value})} />
                <label>Email</label>
                <input type="email" value={formFornecedor.email} onChange={e => setFormFornecedor({...formFornecedor, email: e.target.value})} />
                <label>Senha Mestra *</label>
                <input type="password" value={masterPassword} onChange={e => setMasterPassword(e.target.value)} required />
                <div className={styles.modalActions}>
                <button type="button" onClick={() => setModalFornecedor({ open: false })}>Cancelar</button>
                <button type="submit" disabled={submitLoading}>Salvar</button>
                </div>
            </form>
            <hr />
            <h4>Fornecedores Cadastrados</h4>
            <ul className={styles.listagemModal}>
                {listaFornecedores.map(f => (
                <li key={f.id}>
                    <span>{f.nome} {f.contato ? `- ${f.contato}` : ''}</span>
                    <div>
                    <button onClick={() => handleEditFornecedor(f)}>Editar</button>
                    <button onClick={() => handleDeleteFornecedor(f.id, f.nome)}>Excluir</button>
                    </div>
                </li>
                ))}
            </ul>
            <div className={styles.modalActions}>
                <button type="button" onClick={() => setModalFornecedor({ open: false })}>Fechar</button>
            </div>
            </div>
        </div>
        )}

        {/* Modal Categoria */}
        {modalCategoria.open && (
        <div className={styles.modalOverlay}>
            <div className={styles.modal}>
            <h3>{modalCategoria.editId ? 'Editar Categoria' : 'Nova Categoria'}</h3>
            <form onSubmit={handleSubmitCategoria}>
                <label>Nome *</label>
                <input value={formCategoria.nome} onChange={e => setFormCategoria({...formCategoria, nome: e.target.value})} required />
                <label>Descrição</label>
                <input value={formCategoria.descricao} onChange={e => setFormCategoria({...formCategoria, descricao: e.target.value})} />
                <label>Senha Mestra *</label>
                <input type="password" value={masterPassword} onChange={e => setMasterPassword(e.target.value)} required />
                <div className={styles.modalActions}>
                <button type="button" onClick={() => setModalCategoria({ open: false })}>Cancelar</button>
                <button type="submit" disabled={submitLoading}>Salvar</button>
                </div>
            </form>
            <hr />
            <h4>Categorias Cadastradas</h4>
            <ul className={styles.listagemModal}>
                {listaCategorias.map(c => (
                <li key={c.id}>
                    <span>{c.nome} {c.descricao ? `- ${c.descricao}` : ''}</span>
                    <div>
                    <button onClick={() => handleEditCategoria(c)}>Editar</button>
                    <button onClick={() => handleDeleteCategoria(c.id, c.nome)}>Excluir</button>
                    </div>
                </li>
                ))}
            </ul>
            <div className={styles.modalActions}>
                <button type="button" onClick={() => setModalCategoria({ open: false })}>Fechar</button>
            </div>
            </div>
        </div>
        )}

      {/* Modais (reutilizando estrutura anterior) */}
      {modalProduto.open && (
        <ModalProduto
          formData={formProduto}
          setFormData={setFormProduto}
          masterPassword={masterPassword}
          setMasterPassword={setMasterPassword}
          onSubmit={handleSubmitProduto}
          onCancel={() => setModalProduto({ open: false })}
          loading={submitLoading}
          categorias={categorias}
          fornecedores={fornecedores}
          isEdit={!!modalProduto.editId}
        />
      )}

      {modalLote.open && (
        <ModalLote
          formData={formLote}
          setFormData={setFormLote}
          masterPassword={masterPassword}
          setMasterPassword={setMasterPassword}
          onSubmit={handleSubmitLote}
          onCancel={() => setModalLote({ open: false })}
          loading={submitLoading}
          fornecedores={fornecedores}
        />
      )}

      {modalQuebra.open && produtoSelecionado && (
        <ModalQuebra
          formData={formQuebra}
          setFormData={setFormQuebra}
          masterPassword={masterPassword}
          setMasterPassword={setMasterPassword}
          onSubmit={handleSubmitQuebra}
          onCancel={() => setModalQuebra({ open: false })}
          loading={submitLoading}
          lotes={lotesDoProduto}
          produto={produtoSelecionado}
        />
      )}
      {modalPerdas && (
        <ModalPerdas perdas={ultimasPerdas} onClose={() => setModalPerdas(false)} />
      )}
      {modalDelete.open && modalDelete.produtoNome && (
        <ModalDelete
          produtoNome={modalDelete.produtoNome}
          masterPassword={masterPassword}
          setMasterPassword={setMasterPassword}
          onSubmit={handleSubmitDelete}
          onCancel={() => setModalDelete({ open: false })}
          loading={submitLoading}
        />
      )}
        
    </div>
    
  );
}


// Componentes de Modal (podem ficar no mesmo arquivo)
function ModalProduto({ formData, setFormData, masterPassword, setMasterPassword, onSubmit, onCancel, loading, categorias, fornecedores, isEdit }) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>{isEdit ? 'Editar Produto' : 'Novo Produto'}</h3>
        <form onSubmit={onSubmit}>
          {/* Informações Básicas */}
          <fieldset style={{ borderBottom: '1px solid #ccc', paddingBottom: '15px', marginBottom: '15px' }}>
            <legend style={{ fontWeight: 'bold', fontSize: '14px' }}>📋 Informações Básicas</legend>
            
            <label><strong>Nome do Produto *</strong></label>
            <input 
              value={formData.nome} 
              onChange={e => setFormData({...formData, nome: e.target.value})} 
              required 
              placeholder="Ex: Açúcar Cristal"
            />

            <label><strong>Descrição</strong></label>
            <input 
              value={formData.descricao} 
              onChange={e => setFormData({...formData, descricao: e.target.value})}
              placeholder="Ex: Açúcar cristal 1kg saco branco"
            />

            <label><strong>Código Barras</strong></label>
            <input 
              value={formData.codigo_barras} 
              onChange={e => setFormData({...formData, codigo_barras: e.target.value})}
              placeholder="Ex: 7891000100105"
            />
          </fieldset>

          {/* Rastreamento - Categoria e Fornecedor */}
          <fieldset style={{ borderBottom: '1px solid #ccc', paddingBottom: '15px', marginBottom: '15px' }}>
            <legend style={{ fontWeight: 'bold', fontSize: '14px' }}>Rastreamento (Obrigatório)</legend>
            
            <label><strong>Categoria do Produto *</strong></label>
            <select 
              value={formData.categoria_id} 
              onChange={e => setFormData({...formData, categoria_id: e.target.value})}
              required
              style={{ borderColor: !formData.categoria_id ? '#ff6b6b' : '' }}
            >
              <option value="">-- Selecione uma categoria --</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <small style={{ color: '#666' }}>Defina a categoria (Ex: Bebidas, Alimentos, Higiene)</small>

            <label><strong>Fornecedor *</strong></label>
            <select 
              value={formData.fornecedor_id} 
              onChange={e => setFormData({...formData, fornecedor_id: e.target.value})}
              required
              style={{ borderColor: !formData.fornecedor_id ? '#ff6b6b' : '' }}
            >
              <option value="">-- Selecione o fornecedor --</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            <small style={{ color: '#666' }}>Quem você compra este produto? (Para rastreamento de origem)</small>

            <label><strong>Data de Entrada no Estoque</strong></label>
            <input 
              type="date" 
              value={formData.data_entrada} 
              onChange={e => setFormData({...formData, data_entrada: e.target.value})}
            />
            <small style={{ color: '#666' }}>Quando este produto entrou no seu estoque?</small>
          </fieldset>

          {/* Preços */}
          <fieldset style={{ borderBottom: '1px solid #ccc', paddingBottom: '15px', marginBottom: '15px' }}>
            <legend style={{ fontWeight: 'bold', fontSize: '14px' }}>Preços (Por Unidade)</legend>
            
            <label><strong>Preço de Custo (por unidade) *</strong></label>
            <input 
              type="number" 
              step="0.01" 
              value={formData.preco_custo} 
              onChange={e => setFormData({...formData, preco_custo: e.target.value})} 
              required 
              placeholder="0.00"
            />
            <small style={{ color: '#666' }}>Quanto você paga por uma unidade?</small>

            <label><strong>Preço de Venda (por unidade) *</strong></label>
            <input 
              type="number" 
              step="0.01" 
              value={formData.preco_venda} 
              onChange={e => setFormData({...formData, preco_venda: e.target.value})} 
              required 
              placeholder="0.00"
            />
            <small style={{ color: '#666' }}>Por quanto você vende uma unidade?</small>
          </fieldset>

          {/* Unidade e Quantidade */}
          <fieldset style={{ borderBottom: '1px solid #ccc', paddingBottom: '15px', marginBottom: '15px' }}>
            <legend style={{ fontWeight: 'bold', fontSize: '14px' }}>📦 Unidade e Quantidade</legend>
            
            <label><strong>Unidade de Medida</strong></label>
            <input 
              value={formData.unidade_medida} 
              onChange={e => setFormData({...formData, unidade_medida: e.target.value})}
              placeholder="Ex: UN, KG, L, CX, FARDO"
            />
            <small style={{ color: '#666' }}>Como você conta (Unidade, Quilo, Litro, Caixa, Fardo...)?</small>

            <label><strong>Quantidade Total em Estoque</strong></label>
            <input 
              type="number" 
              value={formData.quantidade_estoque} 
              onChange={e => setFormData({...formData, quantidade_estoque: e.target.value})}
              placeholder="0"
            />
            <small style={{ color: '#666' }}>Total de unidades em estoque no momento</small>

            <label><strong>Estoque Mínimo (alerta)</strong></label>
            <input 
              type="number" 
              value={formData.estoque_minimo} 
              onChange={e => setFormData({...formData, estoque_minimo: e.target.value})}
              placeholder="5"
            />
            <small style={{ color: '#666' }}>Quantidade abaixo da qual o sistema avisa</small>
          </fieldset>

          {/* Packs/Fardos */}
          <fieldset style={{ borderBottom: '1px solid #ccc', paddingBottom: '15px', marginBottom: '15px' }}>
            <legend style={{ fontWeight: 'bold', fontSize: '14px' }}>📮 Controle por Fardo/Pack (Opcional)</legend>
            
            <label><strong>Quantidade de Fardos/Packs em Estoque</strong></label>
            <input 
              type="number" 
              value={formData.quantidade_pack} 
              onChange={e => setFormData({...formData, quantidade_pack: e.target.value})}
              placeholder="0"
            />
            <small style={{ color: '#666' }}>Ex: 10 fardos de açúcar</small>

            <label><strong>Unidades por Fardo/Pack</strong></label>
            <input 
              type="number" 
              value={formData.unidades_por_pack} 
              onChange={e => setFormData({...formData, unidades_por_pack: e.target.value})}
              placeholder="1"
            />
            <small style={{ color: '#666' }}>Ex: 1 fardo tem 100 unidades de açúcar</small>
          </fieldset>

          {/* Validade */}
          <fieldset style={{ borderBottom: '1px solid #ccc', paddingBottom: '15px', marginBottom: '15px' }}>
            <legend style={{ fontWeight: 'bold', fontSize: '14px' }}>Validade</legend>
            
            <label><strong>Data de Validade</strong></label>
            <input 
              type="date" 
              value={formData.data_validade} 
              onChange={e => setFormData({...formData, data_validade: e.target.value})}
            />
            <small style={{ color: '#666' }}>Quando o produto vence?</small>
          </fieldset>

          {/* Segurança */}
          <fieldset style={{ paddingBottom: '15px', marginBottom: '15px' }}>
            <legend style={{ fontWeight: 'bold', fontSize: '14px' }}>Segurança</legend>
            
            <label><strong>Senha Mestra *</strong></label>
            <input 
              type="password" 
              value={masterPassword} 
              onChange={e => setMasterPassword(e.target.value)} 
              required 
              placeholder="Digite a senha"
            />
          </fieldset>

          <div className={styles.modalActions}>
            <button type="button" onClick={onCancel}>Cancelar</button>
            <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar Produto'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalLote({ formData, setFormData, masterPassword, setMasterPassword, onSubmit, onCancel, loading, fornecedores }) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>Entrada de Mercadoria (Lote)</h3>
        <form onSubmit={onSubmit}>
          <label>Fornecedor</label>
          <select value={formData.fornecedor_id} onChange={e => setFormData({...formData, fornecedor_id: e.target.value})}>
            <option value="">Nenhum</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <label>Nº Lote</label>
          <input value={formData.numero_lote} onChange={e => setFormData({...formData, numero_lote: e.target.value})} />
          <label>Quantidade</label>
          <input type="number" value={formData.quantidade} onChange={e => setFormData({...formData, quantidade: e.target.value})} required />
          <label>Preço Custo Unit.</label>
          <input type="number" step="0.01" value={formData.preco_custo_unitario} onChange={e => setFormData({...formData, preco_custo_unitario: e.target.value})} required />
          <label>Data Compra</label>
          <input type="date" value={formData.data_compra} onChange={e => setFormData({...formData, data_compra: e.target.value})} />
          <label>Data Validade</label>
          <input type="date" value={formData.data_validade} onChange={e => setFormData({...formData, data_validade: e.target.value})} />
          <label>Senha Mestra</label>
          <input type="password" value={masterPassword} onChange={e => setMasterPassword(e.target.value)} required />
          <div className={styles.modalActions}>
            <button type="button" onClick={onCancel}>Cancelar</button>
            <button type="submit" disabled={loading}>Registrar Entrada</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalQuebra({ formData, setFormData, masterPassword, setMasterPassword, onSubmit, onCancel, loading, lotes, produto }) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>Registrar Quebra/Perda - {produto.nome}</h3>
        <form onSubmit={onSubmit}>
          <label>Quantidade (negativa)</label>
          <input type="number" value={formData.quantidade} onChange={e => setFormData({...formData, quantidade: e.target.value})} required />
          <label>Lote (opcional)</label>
          <select value={formData.lote_id} onChange={e => setFormData({...formData, lote_id: e.target.value})}>
            <option value="">Todos</option>
            {lotes.map(l => <option key={l.id} value={l.id}>Lote {l.numero_lote || l.id} - {l.quantidade_atual} un.</option>)}
          </select>
          <label>Motivo</label>
          <input value={formData.motivo} onChange={e => setFormData({...formData, motivo: e.target.value})} placeholder="Vencido, avaria, etc." required />
          <label>Senha Mestra</label>
          <input type="password" value={masterPassword} onChange={e => setMasterPassword(e.target.value)} required />
          <div className={styles.modalActions}>
            <button type="button" onClick={onCancel}>Cancelar</button>
            <button type="submit" disabled={loading}>Registrar</button>
          </div>
        </form>
      </div>
    </div>
  );
}



function ModalPerdas({ perdas, onClose }: { perdas: Perda[]; onClose: () => void }) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>Últimas Perdas</h3>
        <div className={styles.modalContent}>
          {perdas.length === 0 ? (
            <p>Nenhuma perda registrada.</p>
          ) : (
            <ul className={styles.perdasList}>
              {perdas.map(perda => (
                <li key={perda.id}>
                  <strong>{perda.produto_nome}</strong> {perda.lote_numero ? `- Lote ${perda.lote_numero}` : ''}
                  <br />
                  {perda.quantidade} un. • {perda.motivo}
                  <br />
                  <small>{new Date(perda.data_movimentacao).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function ModalDelete({ produtoNome, masterPassword, setMasterPassword, onSubmit, onCancel, loading }: {
  produtoNome: string;
  masterPassword: string;
  setMasterPassword: (password: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>⚠️ Confirmar Exclusão Permanente</h3>
        <p>Tem certeza que deseja excluir o produto <strong>{produtoNome}</strong>?</p>
        <p style={{ color: 'red', fontSize: '14px' }}>
          ❌ <strong>ATENÇÃO:</strong> Isso irá deletar permanentemente:
          <br />• O produto e todos os seus dados
          <br />• Todos os lotes associados
          <br />• Todas as movimentações (entradas, saídas, quebras)
          <br />
          <strong>Esta ação NÃO pode ser desfeita!</strong>
        </p>
        <form onSubmit={onSubmit}>
          <label>Senha Mestra (para confirmar)</label>
          <input
            type="password"
            value={masterPassword}
            onChange={e => setMasterPassword(e.target.value)}
            required
            placeholder="Digite a senha mestra"
            autoFocus
          />
          <div className={styles.modalActions}>
            <button type="button" onClick={onCancel} disabled={loading}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ backgroundColor: '#dc3545' }}>
              {loading ? 'Excluindo...' : 'Excluir Permanentemente'}
            </button>
          </div>
        </form>
      </div>
    </div>
    
  );
}

export default Estoque;