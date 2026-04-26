import { useAuth } from '../../context/AuthContext';
import { useAuthorization } from '../../hooks/useAuthorization';
import style from './Dhashboard.module.css';

function Dashboard() {
  const { user, logout } = useAuth();
  const { isAdmin } = useAuthorization();

  const handleLogout = async () => {
    await logout();
  };

  const handleOpenDatabaseFolder = async () => {
    try {
      const folderPath = await window.electron.ipcRenderer.invoke('db:getPath');
      await window.electron.ipcRenderer.invoke('db:openFolder', folderPath);
    } catch (error) {
      console.error('Erro ao abrir pasta:', error);
      alert('Não foi possível abrir a pasta do banco de dados.');
    }
  };


  return (
    <div className={style.container}>
      <div className={style.header}>
        
        <div>
          <h1>Dashboard</h1>
        </div>
        <div className={style.user}>
          <div className={style.userInfo}>
            <span>Usuário: {user?.nome || user?.username}</span>
            {user?.role === 'admin' && <span className={style.adminBadge}>Admin</span>}
          </div>
          <button onClick={handleLogout}>Sair</button>
        </div>
      </div>

      <div className={style.menu}>
        {isAdmin && (
          <>
            <a href="#/usuarios">Usuários</a>
            <a href="#/estoque">Estoque</a>
            <a href="#/relatorios">Relatórios</a>
            {isAdmin && (
                <button onClick={handleOpenDatabaseFolder} className={style.dbButton}>
                    Banco de Dados
                </button>
            )}
          </>
        )}
        <a href="#/vendas">Vendas</a>
        <a href="#/caixa">Caixa</a>
      </div>

      <div className={style.content}>
        {isAdmin ? (
          <p>Painel do Administrador - Aqui virão gráficos e relatórios gerenciais.</p>
        ) : (
          <p>Painel do Operador - Acesso rápido às funções de venda e abertura de caixa.</p>
        )}
      </div>
    </div>
  );
}

export default Dashboard;