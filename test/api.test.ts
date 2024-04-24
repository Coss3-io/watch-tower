import request from "supertest";
import { app } from "../src/app";
import axios from "axios";
import { ethers } from "ethers";
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
} from "../src/configs/messages";
import BigNumber from "bignumber.js";
import { apiUrl } from "../src/configs";
import { signData } from "../src/services";

jest.mock("axios");
jest.mock("ethers");
const realEthers = jest.requireActual("ethers");

const mockedEthers = ethers as jest.Mocked<typeof ethers>;
const mockedAxios = axios as jest.Mocked<typeof axios>;
mockedAxios.post.mockReset();
mockedAxios.post.mockResolvedValue({});

const rpcMock = jest.fn();
const balanceMock = jest.fn();
mockedEthers.JsonRpcProvider.mockImplementation(() => <any>rpcMock);
mockedEthers.Contract.mockImplementation(() => <any>{ balanceOf: balanceMock });
mockedEthers.getAddress.mockImplementation(realEthers.getAddress);

const token1 = "0x4BBEEB066ED09B7AeD07bf39eEE0460DFA261525";
const token2 = "0x4bBEeb066ed09B7Aed07BF39EEe0460dFa261526";
const token3 = "0x4bBeEb066ed09b7Aed07bF39eEE0460dfa261527";

describe("Checks the error scenarios of the API", () => {
  test("An empty request should fail w/ error message", async () => {
    const response = await request(app).post("/verify").send({});
    expect(response.statusCode).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  test("A request with a body with an empty orders array should fail", async () => {
    const response = await request(app)
      .post("/verify")
      .send({ token: token1, chainId: 56 });
    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(3);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: NO_ORDER,
      path: "orders",
      location: "body",
    });
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: EMPTY_ORDERS,
      path: "orders",
      location: "body",
    });
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: WRONG_ORDERS,
      path: "orders",
      location: "body",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  test("A request with an empty token field should fail", async () => {
    const response = await request(app)
      .post("/verify")
      .send({
        orders: [{ address: token2, amount: new BigNumber("1e19").toFixed() }],
        chainId: 56,
      });
    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(3);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: NO_TOKEN,
      path: "token",
      location: "body",
    });
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: TOKEN_STRING,
      path: "token",
      location: "body",
    });
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: TOKEN_ADDRESS,
      path: "token",
      location: "body",
    });
  });

  test("A request with an empty chainid field should fail", async () => {
    const response = await request(app)
      .post("/verify")
      .send({
        orders: [{ address: token2, amount: new BigNumber("1e19").toFixed() }],
        token: token1,
      });
    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(3);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: NO_CHAINID,
      path: "chainId",
      location: "body",
    });
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: CHAINID_INT,
      path: "chainId",
      location: "body",
    });
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: CHAINID_VALID,
      path: "chainId",
      location: "body",
    });
  });

  test("A request with a wrong order should fail", async () => {
    const orders = [{ token: token2, amount: "wrongOrder567" }];
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token1,
      chainId: 56,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: WRONG_ORDERS,
      path: "orders",
      location: "body",
      value: orders,
    });
  });

  test("A request with a missing order amount should fail", async () => {
    const orders = [{ address: token2 }];
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token1,
      chainId: 56,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: WRONG_ORDERS,
      path: "orders",
      location: "body",
      value: orders,
    });
  });

  test("A request with a missing order token should fail", async () => {
    const orders = [{ amount: "45" }];
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token1,
      chainId: 56,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: WRONG_ORDERS,
      path: "orders",
      location: "body",
      value: orders,
    });
  });

  test("A request with a string chainId should fail", async () => {
    const orders = [{ address: token2, amount: "45" }];
    const chainId = "56a";
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token1,
      chainId: chainId,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(2);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: CHAINID_INT,
      path: "chainId",
      location: "body",
      value: chainId,
    });
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: CHAINID_VALID,
      path: "chainId",
      location: "body",
      value: chainId,
    });
  });

  test("A request with a no network chainId should fail", async () => {
    const orders = [{ address: token2, amount: "45" }];
    const chainId = "54";
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token1,
      chainId: chainId,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: CHAINID_VALID,
      path: "chainId",
      location: "body",
      value: chainId,
    });
  });

  test("A request with a non string token should fail", async () => {
    const orders = [{ address: token2, amount: "45" }];
    const chainId = "56";
    const token = 345;
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token,
      chainId: chainId,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(2);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: TOKEN_STRING,
      path: "token",
      location: "body",
      value: token,
    });
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: TOKEN_ADDRESS,
      path: "token",
      location: "body",
      value: token,
    });
  });

  test("A request with a wrong token address should fail", async () => {
    const orders = [{ address: token2, amount: "45" }];
    const chainId = "56";
    const token = token1 + "a";
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token,
      chainId: chainId,
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors).toContainEqual({
      type: "field",
      msg: TOKEN_ADDRESS,
      path: "token",
      location: "body",
      value: token,
    });
  });
});

describe("Checks the working scenarios of the API", () => {
  test("Checks a regular request works well and call the blockchain correctly", async () => {
    const orders = [{ address: token2, amount: "45" }];
    const chainId = "56";
    const token = token1;
    balanceMock.mockReturnValue("72");
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token,
      chainId: chainId,
    });

    expect(response.statusCode).toBe(200);
    expect(balanceMock).toHaveBeenCalledWith(token2);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("Checks a regular insuffient balance is handled correcly", async () => {
    balanceMock.mockReset();
    const orders = [
      { address: token2, amount: "58" },
      { address: token3, amount: "45" },
    ];
    const chainId = "56";
    const token = token1;
    balanceMock.mockReturnValueOnce("56").mockReturnValueOnce("39");
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token,
      chainId: chainId,
    });

    const faultyOrders = {
      [token2]: "56",
      [token3]: "39",
    }

    expect(response.statusCode).toBe(200);
    expect(balanceMock).toHaveBeenNthCalledWith(1, token2);
    expect(balanceMock).toHaveBeenNthCalledWith(2, token3);
    expect(axios.post).toHaveBeenCalledWith(
      apiUrl,
      signData({ orders: faultyOrders, token: token })
    );
    expect(response.body).toEqual(faultyOrders);
  });

  test("Checks when the provider is not available an error is returned", async () => {
    balanceMock.mockReset();
    mockedAxios.post.mockReset();
    const orders = [
      { address: token2, amount: "58" },
      { address: token3, amount: "45" },
    ];
    const chainId = "56";
    const token = token1;
    balanceMock.mockImplementation(() => {
      throw new Error("Network error");
    });
    const response = await request(app).post("/verify").send({
      orders: orders,
      token: token,
      chainId: chainId,
    });

    const faultyOrders = [
      { address: token2, balance: "56" },
      { address: token3, balance: "39" },
    ];

    expect(response.statusCode).toBe(400);
    expect(balanceMock).toHaveBeenCalledWith(token2);
    expect(axios.post).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      errors: "An error occured during balances retrieval from the blockchain",
    });
  });
});
