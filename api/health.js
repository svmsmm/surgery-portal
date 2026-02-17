// Простая функция для проверки, видит ли Vercel нашу папку API
export default function handler(req, res) {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running correctly!',
    timestamp: new Date().toISOString()
  });
}