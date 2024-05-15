import express from "express";
import { router } from "./routes";
import cron from "node-cron";
import morgan from "morgan";
import { Inspector } from "./services/inspector";
import { chainRPC } from "./configs";
import axios from "axios";

const inspectors: Inspector[] = [];
axios.defaults.validateStatus = status => status >= 200 && status <= 500;

Object.keys(chainRPC).forEach((chainId) => {
  inspectors.push(new Inspector(chainId));
});


export const app = express();

if (process.env.JEST_WORKER_ID === undefined) {
  cron.schedule("* * * * *", async () => {
    inspectors.forEach((inspector) => {
      inspector.tradeAnalysis();
      inspector.stackingAnalysis();
    });
  });
  app.use(morgan("tiny"));
}
app.use(express.json());
app.use("/verify", router);
app.get("/", (req, res) => {
  res.send("Hello World!");
});
