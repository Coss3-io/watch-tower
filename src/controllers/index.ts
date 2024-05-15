import { Request, Response } from "express";
import { ethers } from "ethers";
import { apiUrl, chainRPC, erc20ABI, watchTowerVerificationPath } from "../configs";
import BN from "bignumber.js";
import axios from "axios";
import { signData } from "../services";
import { matchedData, validationResult } from "express-validator";

export async function post(
  req: Request<
    any,
    any,
    {
      chainId: keyof typeof chainRPC;
      token: string;
      orders: { address: string; amount: string }[];
    }
  >,
  res: Response,
  next: Function
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const data = matchedData(req);
  const rpc = chainRPC[<keyof typeof chainRPC>data.chainId];
  const provider = new ethers.JsonRpcProvider(rpc);
  const erc20 = new ethers.Contract(data.token, erc20ABI, provider);

  let faultyOrders: { [key in string]: string } = {};
  let promises: Promise<string>[] = [];
  let result: string[] = [];

  try {
    data.orders.forEach((order: { address: string; amount: string }) => {
      promises.push(erc20.balanceOf(order.address));
    });
    result = await Promise.all(promises);
  } catch (e: any) {
    console.log(
      "An error occured during balances retrieval from the blockchain"
    );
    res.status(400).json({
      errors: "An error occured during balances retrieval from the blockchain",
    });
    return;
  }

  for (let i = 0; i < result.length; ++i) {
    const balance = BN(result[i]);
    const amount = BN(data.orders[i].amount);
    if (balance.lt(amount)) {
      faultyOrders[data.orders[i].address] = balance.toFixed();
    }
  }

  if (Object.values(faultyOrders).length)
    await axios.post(
      apiUrl + watchTowerVerificationPath,
      signData({ orders: faultyOrders, token: data.token })
    );
  res.json(faultyOrders);
}
