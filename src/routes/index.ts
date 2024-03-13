import express from "express";
import { get } from "../controllers";
import { body } from "express-validator";
import { validateAddress, validateOrders } from "../services";
import { chainRPC } from "../configs";

export const router = express.Router();

router.get(
  "/",
  body("orders").isArray({ min: 1 }).custom(validateOrders),
  body("token").isString().custom(validateAddress),
  body("chainId")
    .isInt()
    .custom((value) => String(value) in chainRPC),
  get
);
