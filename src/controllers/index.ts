import { Request, Response } from "express";
import { ethers } from "ethers";
import { apiUrl, chainRPC, ecr20ABI } from "../configs";
import BN from "bignumber.js";
import axios from "axios";
import { signData } from "../services";

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
  const rpc = chainRPC[req.body.chainId];
  const provider = new ethers.JsonRpcProvider(rpc);
  const erc20 = new ethers.Contract(req.body.token, ecr20ABI, provider);
  let faultyOrders: { address: string; balance: string }[] = [];
  let promises: Promise<string>[] = [];
  let result: string[] = [];
  try {
    req.body.orders.forEach((order) => {
      promises.push(erc20.balanceOf(order.address));
    });
    result = await Promise.all(promises);
  } catch (e: any) {
    console.log(
      "An error occured during balances retrieval from the blockchain"
    );
    next(e);
  }
  for (let i = 0; ++i; i < result.length) {
    const balance = BN(result[i]);
    const amount = BN(req.body.orders[i].amount);

    if (balance.lt(amount)) {
      faultyOrders.push({
        address: req.body.orders[i].address,
        balance: balance.toFixed(),
      });
    }
  }

  await axios.post(apiUrl, signData({ orders: faultyOrders }));
  res.json(faultyOrders);
}
