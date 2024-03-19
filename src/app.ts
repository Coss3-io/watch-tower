import express from "express";
import { router } from "./routes";
import cron from "node-cron";
import morgan from "morgan";

cron.schedule("* * * * *", async () => {
  console.log("cron message");
});

export const app = express();

app.use(morgan("tiny"));
app.use(express.json());
app.use("/verify", router);
app.get("/", (req, res) => {
  res.send("Hello World!");
});
