import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import monitorRoutes from './routes/monitor.routes.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/monitors", monitorRoutes);

export default app;