const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Falta token de autenticación.' });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user?.email) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    const email = data.user.email.toLowerCase();

    if (!ADMIN_EMAILS.includes(email)) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    req.adminEmail = email;
    next();
  } catch (err) {
    console.error('Error en requireAdmin:', err.message);
    return res.status(401).json({ error: 'No se pudo validar la sesión.' });
  }
};

module.exports = requireAdmin;