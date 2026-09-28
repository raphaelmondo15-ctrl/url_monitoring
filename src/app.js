import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import monitorRoutes from './routes/monitor.routes.js';
import checkRoutes from './routes/check.routes.js';
import uptimeRoutes from './routes/uptime.routes.js';
import incidentRoutes from './routes/incident.routes.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/monitors", monitorRoutes);
app.use("/monitors", checkRoutes);
app.use("/monitors", uptimeRoutes);
app.use("/incidents", incidentRoutes);

export default app;
