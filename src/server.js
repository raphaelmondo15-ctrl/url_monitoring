import dotenv from 'dotenv';
import app from './app.js';
import { startScheduler } from './scheduler/monitor.scheduler.js';

dotenv.config();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

startScheduler();
