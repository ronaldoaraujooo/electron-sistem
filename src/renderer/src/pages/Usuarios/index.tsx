import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Usuarios.module.css';

interface Usuario {
  id: number;
  username: string;
  nome_completo: string;
  role: 'admin' | 'operador';
  criado_em: string;
}

function Usuarios() {
  const { token } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [formData, setFormData] = useState({ username: '', password: '', nome: '', role: 'operador' as 'admin' | 'operador' });
  const [masterPassword, setMasterPassword] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const carregarUsuarios = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await window.electron.ipcRenderer.invoke('usuarios:listar', token);
      if (result.success && result.usuarios) {
        setUsuarios(result.usuarios);
      } else {
        setError(result.error || 'Erro ao carregar usuários');
      }
    } catch (err) {
      setError('Falha na comunicação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarUsuarios();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitLoading(true);
    try {
      const result = await window.electron.ipcRenderer.invoke('usuarios:criar', token, masterPassword, {
        username: formData.username,
        password: formData.password,
        nome: formData.nome,
        role: formData.role,
      });
      if (result.success) {
        alert('Usuário criado!');
        setShowCreateModal(false);
        resetForm();
        carregarUsuarios();
      } else {
        alert(result.error);
      }
    } catch {
      alert('Erro ao criar');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingUser) return;
    setSubmitLoading(true);
    try {
      const dados: any = {};
      if (formData.username) dados.username = formData.username;
      if (formData.password) dados.password = formData.password;
      if (formData.nome) dados.nome = formData.nome;
      if (formData.role) dados.role = formData.role;
      const result = await window.electron.ipcRenderer.invoke('usuarios:editar', token, masterPassword, editingUser.id, dados);
      if (result.success) {
        alert('Usuário atualizado!');
        setShowEditModal(false);
        resetForm();
        carregarUsuarios();
      } else {
        alert(result.error);
      }
    } catch {
      alert('Erro ao editar');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    const senha = prompt('Digite a senha mestra para excluir:');
    if (!senha) return;
    try {
      const result = await window.electron.ipcRenderer.invoke('usuarios:excluir', token, senha, id);
      if (result.success) {
        carregarUsuarios();
      } else {
        alert(result.error);
      }
    } catch {
      alert('Erro ao excluir');
    }
  };

  const openEditModal = (user: Usuario) => {
    setEditingUser(user);
    setFormData({ username: user.username, password: '', nome: user.nome_completo, role: user.role });
    setMasterPassword('');
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({ username: '', password: '', nome: '', role: 'operador' });
    setMasterPassword('');
    setEditingUser(null);
  };

  if (loading) return <div className={styles.loading}>Carregando...</div>;
  if (error) return <div className={styles.error}>{error}</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <a href="#/dashboard">Dashboard</a>
        <h2>Usuários</h2>
        <button className={styles.addButton} onClick={() => setShowCreateModal(true)}>+ Novo</button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Nome</th>
            <th>Função</th>
            <th>Criado em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map(u => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.nome_completo}</td>
              <td className={u.role === 'admin' ? styles.admin : styles.operador}>{u.role}</td>
              <td>{new Date(u.criado_em).toLocaleString()}</td>
              <td>
                <button onClick={() => openEditModal(u)}>Editar</button>
                <button onClick={() => handleDelete(u.id)} disabled={u.username === 'caixa'}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal Criação */}
      {showCreateModal && (
        <Modal
          title="Novo Usuário"
          formData={formData}
          setFormData={setFormData}
          masterPassword={masterPassword}
          setMasterPassword={setMasterPassword}
          onSubmit={handleCreate}
          onCancel={() => { setShowCreateModal(false); resetForm(); }}
          loading={submitLoading}
        />
      )}

      {/* Modal Edição */}
      {showEditModal && editingUser && (
        <Modal
          title="Editar Usuário"
          formData={formData}
          setFormData={setFormData}
          masterPassword={masterPassword}
          setMasterPassword={setMasterPassword}
          onSubmit={handleEdit}
          onCancel={() => { setShowEditModal(false); resetForm(); }}
          loading={submitLoading}
          isEdit
        />
      )}
    </div>
  );
}

// Componente Modal reutilizável (definido abaixo ou em arquivo separado)
function Modal({ title, formData, setFormData, masterPassword, setMasterPassword, onSubmit, onCancel, loading, isEdit = false }) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>{title}</h3>
        <form onSubmit={onSubmit}>
          <div className={styles.formGroup}>
            <label>Usuário</label>
            <input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required />
          </div>
          <div className={styles.formGroup}>
            <label>Senha {isEdit && '(deixe em branco para não alterar)'}</label>
            <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required={!isEdit} />
          </div>
          <div className={styles.formGroup}>
            <label>Nome Completo</label>
            <input value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} required />
          </div>
          <div className={styles.formGroup}>
            <label>Função</label>
            <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})}>
              <option value="operador">Operador</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Senha Mestra</label>
            <input type="password" value={masterPassword} onChange={e => setMasterPassword(e.target.value)} required />
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onCancel} disabled={loading}>Cancelar</button>
            <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Usuarios;