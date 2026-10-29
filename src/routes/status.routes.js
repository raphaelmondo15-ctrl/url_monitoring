import { Router } from "express";
import { getPublicStatus } from "../controllers/status.controller.js";

const router = Router();

router.get("/", getPublicStatus);

export default router;
