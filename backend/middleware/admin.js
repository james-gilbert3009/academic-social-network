export function requireAdmin(req, res, next) {
  if (!req.user || !req.user.role) {
    return res.status(401).json({ message: "Missing or invalid Authorization header" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  return next();
}

