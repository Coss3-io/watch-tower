import express from "express";
import { router } from "./routes";
import cron from "node-cron";
import morgan from "morgan";
import { Inspector } from "./services/inspector";
import { chainRPC } from "./configs";

const inspectors: Inspector[] = [];

Object.keys(chainRPC).forEach((chainId) => {
  inspectors.push(new Inspector(chainId));
});

cron.schedule("* * * * *", async () => {
  inspectors.forEach((inspector) => {
    inspector.tradeAnalysis();
    inspector.stackingAnalysis();
  });
});

export const app = express();

app.use(morgan("tiny"));
app.use(express.json());
app.use("/verify", router);
app.get("/", (req, res) => {
  res.send("Hello World!");
});
