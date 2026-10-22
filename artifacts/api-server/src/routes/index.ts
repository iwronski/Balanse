import { Router, type IRouter } from "express";
import healthRouter from "./health";
import karbRouter from "./karb";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/karb", karbRouter);

export default router;
