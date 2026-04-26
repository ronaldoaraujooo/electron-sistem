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
