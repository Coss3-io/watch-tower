import express from "express";
import { get } from "../controllers";
import { body } from "express-validator";
import { validateAddress, validateOrders } from "../services";
import { chainRPC } from "../configs";
import {
  CHAINID_INT,
  CHAINID_VALID,
  EMPTY_ORDERS,
  NO_CHAINID,
  NO_ORDER,
  NO_TOKEN,
  TOKEN_ADDRESS,
  TOKEN_STRING,
  WRONG_ORDERS,
} from "../configs/messages";

export const router = express.Router();

router.post(
  "/",
  body("orders")
    .notEmpty()
    .withMessage(NO_ORDER)
    .isArray({ min: 1 })
    .withMessage(EMPTY_ORDERS)
    .custom(validateOrders)
    .withMessage(WRONG_ORDERS),
  body("token")
    .notEmpty()
    .withMessage(NO_TOKEN)
    .isString()
    .withMessage(TOKEN_STRING)
    .custom(validateAddress)
    .withMessage(TOKEN_ADDRESS),
  body("chainId")
    .notEmpty()
    .withMessage(NO_CHAINID)
    .isInt()
    .withMessage(CHAINID_INT)
    .custom((value) => String(value) in chainRPC)
    .withMessage(CHAINID_VALID),
  get
);
