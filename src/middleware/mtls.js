// Valida o certificado de cliente (mTLS)
// O Node.js preenche req.client.authorized quando o servidor usa requestCert:true
function verificarCertificado(req, res, next) {
  if (!req.client.authorized) {
    const cert = req.socket.getPeerCertificate();
    if (!cert || !cert.subject) {
      return res.status(401).json({
        erro: 'Certificado de cliente necessário.',
        detalhe: 'Esta API requer mTLS. Apresente um certificado válido emitido pela CA-ISPTEC.',
      });
    }
    return res.status(403).json({
      erro: 'Certificado não autorizado.',
      detalhe: `O certificado "${cert.subject.CN}" não foi emitido pela CA-ISPTEC ou está revogado.`,
    });
  }

  // Anexa info do cert ao request para uso opcional nas rotas
  const cert = req.socket.getPeerCertificate();
  req.certInfo = {
    cn:      cert.subject?.CN  ?? '—',
    emissor: cert.issuer?.CN   ?? '—',
    validAte: cert.valid_to    ?? '—',
  };

  next();
}

module.exports = { verificarCertificado };
