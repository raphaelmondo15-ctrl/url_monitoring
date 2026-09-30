import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ZodError } from 'zod';
import monitorRoutes from './routes/monitor.routes.js';
import checkRoutes from './routes/check.routes.js';
import uptimeRoutes from './routes/uptime.routes.js';
import incidentRoutes from './routes/incident.routes.js';
import monitorIncidentRoutes from './routes/monitor-incident.routes.js';
import statusRoutes from "./routes/status.routes.js";

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
app.use("/monitors", monitorIncidentRoutes);
app.use("/incidents", incidentRoutes);
app.use("/status", statusRoutes);

app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues
    });
  }
  
  console.error(err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message
  });
});

export default app;
