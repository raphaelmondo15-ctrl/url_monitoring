import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

export default app;