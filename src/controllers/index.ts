import { Request, Response } from "express";
import { ethers } from "ethers";
import { apiUrl, chainRPC, ecr20ABI } from "../configs";
import BN from "bignumber.js";
import axios from "axios";
import { signData } from "../services";
import { matchedData, validationResult } from "express-validator";

export async function get(
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
  const erc20 = new ethers.Contract(data.token, ecr20ABI, provider);

  let faultyOrders: { address: string; balance: string }[] = [];
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
    res.status(400).json({ errors: "An error occured during balances retrieval from the blockchain" });
    return;
  }

  for (let i = 0; i < result.length; ++i) {
    const balance = BN(result[i]);
    const amount = BN(data.orders[i].amount);
    if (balance.lt(amount)) {
      faultyOrders.push({
        address: data.orders[i].address,
        balance: balance.toFixed(),
      });
    }
  }

  if (faultyOrders.length)
    await axios.post(apiUrl, signData({ orders: faultyOrders }));
  res.json(faultyOrders);
}
