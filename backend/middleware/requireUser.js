// Middleware de autenticación de usuario.
// Valida el JWT real de Supabase Auth enviado como "Authorization: Bearer <token>"
// y deja el id del usuario autenticado en req.userId.
//
// Las rutas que lo usan deben tomar el usuario SIEMPRE de req.userId,
// nunca de datos enviados por el cliente (body, params o query).
//
// Variables de entorno reutilizadas tal como ya existen en el backend:
//   SUPABASE_URL, SUPABASE_SECRET (service role).
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET);

const requireUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Falta token de autenticación.' });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user?.id) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    req.userId = data.user.id;
    next();
  } catch (err) {
    console.error('Error en requireUser:', err.message);
    return res.status(401).json({ error: 'No se pudo validar la sesión.' });
  }
};

module.exports = requireUser;