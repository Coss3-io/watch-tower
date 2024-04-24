import { Inspector } from "../src/services/inspector";
import axios from "axios";
import { ethers } from "ethers";
import fs from "fs";
import {
  apiUrl,
  chainRPC,
  dexABI,
  dexContract,
  stackingABI,
  stackingContract,
  stackingFeesPath,
  stackingFeesWithdrawalPath,
  stackingPath,
  watchTowerPath,
} from "../src/configs";

const chainId = "56";
jest.mock("axios");
jest.mock("ethers");
jest.mock("fs");

const realEthers = jest.requireActual("ethers");
const mockedEthers = ethers as jest.Mocked<typeof ethers>;
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;

const providerMock = jest.fn();
const contractMock = jest.fn();
const getBlockMock = jest.fn();
const rpcMock = jest.fn();
// @ts-ignore
rpcMock.getBlock = getBlockMock;
const filterMock = jest.fn();
const readFileMock = jest.fn();
const writeFileMock = jest.fn();
const appendFileMock = jest.fn();

mockedEthers.JsonRpcProvider = providerMock;
mockedEthers.JsonRpcProvider.mockImplementation(() => <any>rpcMock);
mockedEthers.Contract = contractMock;
mockedEthers.Contract.mockImplementation(
  () => <any>{ queryFilter: filterMock }
);
mockedFs.promises = <any>jest.fn();
mockedFs.promises.readFile = readFileMock;
mockedFs.promises.writeFile = writeFileMock;
mockedFs.promises.appendFile = appendFileMock;

describe("Testing the inspector general behaviour", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    writeFileMock.mockReset();
    appendFileMock.mockReset();
    getBlockMock.mockReset();
    filterMock.mockReset();
    rpcMock.mockReset();
    mockedAxios.post.mockReset();
    mockedAxios.delete.mockReset();
    mockedAxios.post.mockResolvedValue({ status: axios.HttpStatusCode.Ok });
    mockedAxios.delete.mockResolvedValue({ status: axios.HttpStatusCode.Ok });
  });

  test("Checks the inspector initialization works well", async () => {
    const inspector = new Inspector(chainId);

    expect(providerMock).toHaveBeenCalledWith(chainRPC[chainId]);
    expect(contractMock).toHaveBeenNthCalledWith(
      1,
      dexContract[chainId],
      dexABI,
      inspector.provider
    );
    expect(contractMock).toHaveBeenNthCalledWith(
      2,
      stackingContract[chainId],
      stackingABI,
      inspector.provider
    );
  });

  test("Checks the trade analysis works", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 45;
    const actualBlock = 75;
    const trade1 = {
      blockNumber: 78,
      args: ["taker", "orderHash", "amount", "fees", "base_fees", "is_buyer"],
    };
    const trade2 = {
      blockNumber: 79,
      args: ["taker", "orderHash", "amount", "fees", "base_fees", "is_buyer"],
    };
    const cancel1 = { args: ["orderHash"] };
    const cancel2 = { args: ["orderHash"] };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    filterMock.mockReturnValueOnce([trade1, trade2]);
    filterMock.mockReturnValueOnce([cancel1, cancel2]);

    await inspector.tradeAnalysis();

    expect(readFileMock).toHaveBeenCalledWith(
      `blocks/trade/${chainId}.txt`,
      "utf8"
    );
    // @ts-ignore
    expect(rpcMock.getBlock).toHaveBeenLastCalledWith("latest");
    expect(filterMock).toHaveBeenNthCalledWith(
      1,
      "NewTrade",
      initialBlock,
      Math.min(actualBlock, parseInt(String(initialBlock)) + 4000)
    );
    expect(filterMock).toHaveBeenNthCalledWith(
      2,
      "Cancel",
      initialBlock,
      Math.min(actualBlock, parseInt(String(initialBlock)) + 4000)
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      apiUrl + watchTowerPath,
      {
        taker: trade1.args[0],
        block: trade1.blockNumber,
        trades: {
          [trade1.args[1]]: {
            amount: trade1.args[2],
            fees: trade1.args[3],
            base_fees: trade1.args[4],
            is_buyer: !trade1.args[5],
          },
        },
      }
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      apiUrl + watchTowerPath,
      {
        taker: trade2.args[0],
        block: trade2.blockNumber,
        trades: {
          [trade2.args[1]]: {
            amount: trade2.args[2],
            fees: trade2.args[3],
            base_fees: trade2.args[4],
            is_buyer: !trade2.args[5],
          },
        },
      }
    );
    expect(mockedAxios.delete).toHaveBeenNthCalledWith(
      1,
      apiUrl + watchTowerPath,
      {
        data: { orderHash: cancel1.args[0] },
      }
    );
    expect(mockedAxios.delete).toHaveBeenNthCalledWith(
      2,
      apiUrl + watchTowerPath,
      {
        data: { orderHash: cancel2.args[0] },
      }
    );

    expect(writeFileMock).toHaveBeenLastCalledWith(
      `blocks/trade/${chainId}.txt`,
      String(actualBlock)
    );
    expect(appendFileMock).not.toHaveBeenCalled();
  });

  test("Checks the stacking deposit analysis works", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 46;
    const actualBlock = 76;

    const deposit1 = {
      blockNumber: 78,
      args: ["45", "2345743", "deposit1Address"],
    };
    const deposit2 = {
      blockNumber: 78,
      args: ["slot", "amount", "deposit2Address"],
    };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    filterMock.mockReturnValueOnce([deposit1, deposit2]); //stack deposit
    filterMock.mockReturnValueOnce([]); //stack withdraw
    filterMock.mockReturnValueOnce([]); // fee deposit
    filterMock.mockReturnValueOnce([]);

    await inspector.stackingAnalysis();

    expect(readFileMock).toHaveBeenCalledWith(
      `blocks/stacking/${chainId}.txt`,
      "utf8"
    );
    // @ts-ignore
    expect(rpcMock.getBlock).toHaveBeenLastCalledWith("latest");
    expect(filterMock).toHaveBeenNthCalledWith(
      1,
      "NewStackDeposit",
      initialBlock,
      Math.min(actualBlock, parseInt(String(initialBlock)) + 4000)
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(1, apiUrl + stackingPath, {
      withdraw: false,
      slot: deposit1.args[0],
      amount: deposit1.args[1],
      address: deposit1.args[2],
      chain_id: parseInt(chainId),
    });

    expect(mockedAxios.post).toHaveBeenNthCalledWith(2, apiUrl + stackingPath, {
      withdraw: false,
      slot: deposit2.args[0],
      amount: deposit2.args[1],
      address: deposit2.args[2],
      chain_id: parseInt(chainId),
    });

    expect(writeFileMock).toHaveBeenLastCalledWith(
      `blocks/stacking/${chainId}.txt`,
      String(actualBlock)
    );
    expect(appendFileMock).not.toHaveBeenCalled();
  });

  test("Checks the stacking withdrawal analysis works", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 46;
    const actualBlock = 76;

    const withdrawal1 = {
      blockNumber: 78,
      args: ["45", "2345743", "withdrawal1Address"],
    };
    const withdrawal2 = {
      blockNumber: 78,
      args: ["slot", "amount", "withdrawal2Address"],
    };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    filterMock.mockReturnValueOnce([]); //stack deposit
    filterMock.mockReturnValueOnce([withdrawal1, withdrawal2]); //stack withdraw
    filterMock.mockReturnValueOnce([]); // fee deposit
    filterMock.mockReturnValueOnce([]); // fee withdrawal

    await inspector.stackingAnalysis();

    expect(readFileMock).toHaveBeenCalledWith(
      `blocks/stacking/${chainId}.txt`,
      "utf8"
    );
    // @ts-ignore
    expect(rpcMock.getBlock).toHaveBeenLastCalledWith("latest");
    expect(filterMock).toHaveBeenNthCalledWith(
      2,
      "NewStackWithdrawal",
      initialBlock,
      Math.min(actualBlock, parseInt(String(initialBlock)) + 4000)
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(1, apiUrl + stackingPath, {
      withdraw: true,
      slot: withdrawal1.args[0],
      amount: withdrawal1.args[1],
      address: withdrawal1.args[2],
      chain_id: parseInt(chainId),
    });

    expect(mockedAxios.post).toHaveBeenNthCalledWith(2, apiUrl + stackingPath, {
      withdraw: true,
      slot: withdrawal2.args[0],
      amount: withdrawal2.args[1],
      address: withdrawal2.args[2],
      chain_id: parseInt(chainId),
    });

    expect(writeFileMock).toHaveBeenLastCalledWith(
      `blocks/stacking/${chainId}.txt`,
      String(actualBlock)
    );
    expect(appendFileMock).not.toHaveBeenCalled();
  });

  test("Checks the fees deposit analysis works", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 46;
    const actualBlock = 76;

    const fees1 = {
      blockNumber: 781,
      args: ["slot1", "feesAmount1", "feesToken1"],
    };
    const fees2 = {
      blockNumber: 784,
      args: ["slot2", "feesAmount2", "feesToken2"],
    };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    filterMock.mockReturnValueOnce([]); //stack deposit
    filterMock.mockReturnValueOnce([]); // stack withdraw
    filterMock.mockReturnValueOnce([fees1, fees2]); // fee deposit
    filterMock.mockReturnValueOnce([]); // fee withdrawal

    await inspector.stackingAnalysis();

    expect(readFileMock).toHaveBeenCalledWith(
      `blocks/stacking/${chainId}.txt`,
      "utf8"
    );
    // @ts-ignore
    expect(rpcMock.getBlock).toHaveBeenLastCalledWith("latest");
    expect(filterMock).toHaveBeenNthCalledWith(
      3,
      "NewFeesDeposit",
      initialBlock,
      Math.min(actualBlock, parseInt(String(initialBlock)) + 4000)
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      apiUrl + stackingFeesPath,
      {
        slot: fees1.args[0],
        amount: fees1.args[1],
        token: fees1.args[2],
        chain_id: parseInt(chainId),
      }
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      apiUrl + stackingFeesPath,
      {
        slot: fees2.args[0],
        amount: fees2.args[1],
        token: fees2.args[2],
        chain_id: parseInt(chainId),
      }
    );

    expect(writeFileMock).toHaveBeenLastCalledWith(
      `blocks/stacking/${chainId}.txt`,
      String(actualBlock)
    );
    expect(appendFileMock).not.toHaveBeenCalled();
  });

  test("Checks the fees withdrawal analysis works", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 461;
    const actualBlock = 763;

    const fees1 = {
      blockNumber: 7811,
      args: ["slot1", "address1", ["feesToken11", "feesToken12"]],
    };
    const fees2 = {
      blockNumber: 7842,
      args: ["slot2", "address2", ["feesToken21", "feesToken22"]],
    };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    filterMock.mockReturnValueOnce([]); //stack deposit
    filterMock.mockReturnValueOnce([]); // stack withdraw
    filterMock.mockReturnValueOnce([]); // fee deposit
    filterMock.mockReturnValueOnce([fees1, fees2]); // fee withdrawal

    await inspector.stackingAnalysis();

    expect(readFileMock).toHaveBeenCalledWith(
      `blocks/stacking/${chainId}.txt`,
      "utf8"
    );
    // @ts-ignore
    expect(rpcMock.getBlock).toHaveBeenLastCalledWith("latest");
    expect(filterMock).toHaveBeenNthCalledWith(
      4,
      "NewFeesWithdrawal",
      initialBlock,
      Math.min(actualBlock, parseInt(String(initialBlock)) + 4000)
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      apiUrl + stackingFeesWithdrawalPath,
      {
        slot: fees1.args[0],
        address: fees1.args[1],
        token: fees1.args[2][0],
        chain_id: parseInt(chainId),
      }
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      apiUrl + stackingFeesWithdrawalPath,
      {
        slot: fees1.args[0],
        address: fees1.args[1],
        token: fees1.args[2][1],
        chain_id: parseInt(chainId),
      }
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      3,
      apiUrl + stackingFeesWithdrawalPath,
      {
        slot: fees2.args[0],
        address: fees2.args[1],
        token: fees2.args[2][0],
        chain_id: parseInt(chainId),
      }
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      4,
      apiUrl + stackingFeesWithdrawalPath,
      {
        slot: fees2.args[0],
        address: fees2.args[1],
        token: fees2.args[2][1],
        chain_id: parseInt(chainId),
      }
    );

    expect(writeFileMock).toHaveBeenLastCalledWith(
      `blocks/stacking/${chainId}.txt`,
      String(actualBlock)
    );
    expect(appendFileMock).not.toHaveBeenCalled();
  });

  test("Checks the trade blockchain errors are handled well", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 45;

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(new Promise((r, e) => e("Error")));

    await inspector.tradeAnalysis();

    expect(writeFileMock).not.toHaveBeenCalled();
    expect(appendFileMock).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(mockedAxios.delete).not.toHaveBeenCalled();
  });

  test("Checks the new trade send to api errors are handled well", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 45;
    const actualBlock = 75;
    const trade1 = {
      blockNumber: 78,
      args: ["taker", "orderHash", "amount", "fees", "base_fees", "is_buyer"],
    };
    const trade2 = {
      blockNumber: 79,
      args: ["taker", "orderHash", "amount", "fees", "base_fees", "is_buyer"],
    };
    const cancel1 = { args: ["orderHash"] };
    const cancel2 = { args: ["orderHash"] };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    filterMock.mockReturnValueOnce([trade1, trade2]);
    filterMock.mockReturnValueOnce([]);
    mockedAxios.post.mockReturnValueOnce(<Promise<unknown>>(
      (<unknown>{ status: axios.HttpStatusCode.ServiceUnavailable })
    ));
    mockedAxios.post.mockReturnValueOnce(<Promise<unknown>>(<unknown>{
      status: axios.HttpStatusCode.ServiceUnavailable,
    }));
    await inspector.tradeAnalysis();

    expect(appendFileMock).toHaveBeenCalledWith(
      `blocks/trade/errors.log`,
      JSON.stringify([
        {
          path: apiUrl + watchTowerPath,
          method: "post",
          chain_id: chainId,
          taker: trade1.args[0],
          block: trade1.blockNumber,
          trades: {
            [trade1.args[1]]: {
              amount: trade1.args[2],
              fees: trade1.args[3],
              base_fees: trade1.args[4],
              is_buyer: !trade1.args[5],
            },
          },
        },
        {
          path: apiUrl + watchTowerPath,
          method: "post",
          chain_id: chainId,
          taker: trade2.args[0],
          block: trade2.blockNumber,
          trades: {
            [trade2.args[1]]: {
              amount: trade2.args[2],
              fees: trade2.args[3],
              base_fees: trade2.args[4],
              is_buyer: !trade2.args[5],
            },
          },
        },
      ]) + "\n"
    );
  });

  test("Checks the new trade & cancel send to api errors are handled well", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 45;
    const actualBlock = 75;
    const trade1 = {
      blockNumber: 78,
      args: ["taker", "orderHash", "amount", "fees", "base_fees", "is_buyer"],
    };
    const trade2 = {
      blockNumber: 79,
      args: ["taker", "orderHash", "amount", "fees", "base_fees", "is_buyer"],
    };
    const cancel1 = { args: ["orderHash"] };
    const cancel2 = { args: ["orderHash"] };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    filterMock.mockReturnValueOnce([trade1, trade2]);
    filterMock.mockReturnValueOnce([cancel1, cancel2]);
    mockedAxios.post.mockReturnValue(<Promise<unknown>>(
      (<unknown>{ status: axios.HttpStatusCode.ServiceUnavailable })
    ));
    mockedAxios.delete.mockReturnValue(<Promise<unknown>>(<unknown>{
      status: axios.HttpStatusCode.ServiceUnavailable,
    }));
    await inspector.tradeAnalysis();

    expect(appendFileMock).toHaveBeenCalledWith(
      `blocks/trade/errors.log`,
      JSON.stringify([
        {
          path: apiUrl + watchTowerPath,
          method: "post",
          chain_id: chainId,
          taker: trade1.args[0],
          block: trade1.blockNumber,
          trades: {
            [trade1.args[1]]: {
              amount: trade1.args[2],
              fees: trade1.args[3],
              base_fees: trade1.args[4],
              is_buyer: !trade1.args[5],
            },
          },
        },
        {
          path: apiUrl + watchTowerPath,
          method: "post",
          chain_id: chainId,
          taker: trade2.args[0],
          block: trade2.blockNumber,
          trades: {
            [trade2.args[1]]: {
              amount: trade2.args[2],
              fees: trade2.args[3],
              base_fees: trade2.args[4],
              is_buyer: !trade2.args[5],
            },
          },
        },
        {
          path: apiUrl + watchTowerPath,
          method: "delete",
          chain_id: chainId,
          orderHash: cancel1.args[0],
        },
        {
          path: apiUrl + watchTowerPath,
          method: "delete",
          chain_id: chainId,
          orderHash: cancel2.args[0],
        },
      ]) + "\n"
    );
  });

  test("Checks stacking blockchain errors are handled well", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 45;

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(new Promise((r, e) => e("Error")));

    await inspector.stackingAnalysis();

    expect(writeFileMock).not.toHaveBeenCalled();
    expect(appendFileMock).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(mockedAxios.delete).not.toHaveBeenCalled();
  });

  test("Checks stacking entry new stacking api errors are handled well", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 46;
    const actualBlock = 76;

    const deposit1 = {
      blockNumber: 78,
      args: ["45", "2345743", "deposit1Address"],
    };
    const deposit2 = {
      blockNumber: 78,
      args: ["slot", "amount", "deposit2Address"],
    };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    mockedAxios.post.mockReturnValue(<Promise<unknown>>(
      (<unknown>{ status: axios.HttpStatusCode.ServiceUnavailable })
    ));
    filterMock.mockReturnValueOnce([deposit1, deposit2]); //stack deposit
    filterMock.mockReturnValueOnce([]); //stack withdraw
    filterMock.mockReturnValueOnce([]); // fee deposit
    filterMock.mockReturnValueOnce([]);

    await inspector.stackingAnalysis();
    expect(appendFileMock).toHaveBeenCalledWith(
      `blocks/stacking/errors.log`,
      JSON.stringify([
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: deposit1.args[2],
          withdraw: false,
          amount: deposit1.args[1],
          slot: deposit1.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: deposit2.args[2],
          withdraw: false,
          amount: deposit2.args[1],
          slot: deposit2.args[0],
          chain_id: parseInt(chainId),
        },
      ]) + "\n"
    );
  });

  test("Checks stacking entry new stacking & deposit api errors are handled well", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 46;
    const actualBlock = 76;

    const deposit1 = {
      blockNumber: 78,
      args: ["45", "2345743", "deposit1Address"],
    };
    const deposit2 = {
      blockNumber: 78,
      args: ["slot", "amount", "deposit2Address"],
    };

    const withdraw1 = {
      blockNumber: 79,
      args: ["45", "2345743", "withdraw1Address"],
    };
    const withdraw2 = {
      blockNumber: 788,
      args: ["slot", "amount", "withdraw2Address"],
    };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    mockedAxios.post.mockReturnValue(<Promise<unknown>>(
      (<unknown>{ status: axios.HttpStatusCode.ServiceUnavailable })
    ));
    filterMock.mockReturnValueOnce([deposit1, deposit2]); //stack deposit
    filterMock.mockReturnValueOnce([withdraw1, withdraw2]); //stack withdraw
    filterMock.mockReturnValueOnce([]); // fee deposit
    filterMock.mockReturnValueOnce([]);

    await inspector.stackingAnalysis();
    expect(appendFileMock).toHaveBeenCalledWith(
      `blocks/stacking/errors.log`,
      JSON.stringify([
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: deposit1.args[2],
          withdraw: false,
          amount: deposit1.args[1],
          slot: deposit1.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: deposit2.args[2],
          withdraw: false,
          amount: deposit2.args[1],
          slot: deposit2.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: withdraw1.args[2],
          withdraw: true,
          amount: withdraw1.args[1],
          slot: withdraw1.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: withdraw2.args[2],
          withdraw: true,
          amount: withdraw2.args[1],
          slot: withdraw2.args[0],
          chain_id: parseInt(chainId),
        },
      ]) + "\n"
    );
  });

  test("Checks stacking entry new stacking & deposit & fees deposit api errors are handled well", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 46;
    const actualBlock = 76;

    const deposit1 = {
      blockNumber: 78,
      args: ["45", "2345743", "deposit1Address"],
    };
    const deposit2 = {
      blockNumber: 78,
      args: ["slot", "amount", "deposit2Address"],
    };

    const withdraw1 = {
      blockNumber: 79,
      args: ["45", "2345743", "withdraw1Address"],
    };
    const withdraw2 = {
      blockNumber: 788,
      args: ["slot", "amount", "withdraw2Address"],
    };
    const fees1 = {
      blockNumber: 781,
      args: ["slot1", "feesAmount1", "feesToken1"],
    };
    const fees2 = {
      blockNumber: 784,
      args: ["slot2", "feesAmount2", "feesToken2"],
    };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    mockedAxios.post.mockReturnValue(<Promise<unknown>>(
      (<unknown>{ status: axios.HttpStatusCode.ServiceUnavailable })
    ));
    filterMock.mockReturnValueOnce([deposit1, deposit2]); //stack deposit
    filterMock.mockReturnValueOnce([withdraw1, withdraw2]); //stack withdraw
    filterMock.mockReturnValueOnce([fees1, fees2]); // fee deposit
    filterMock.mockReturnValueOnce([]);

    await inspector.stackingAnalysis();
    expect(appendFileMock).toHaveBeenCalledWith(
      `blocks/stacking/errors.log`,
      JSON.stringify([
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: deposit1.args[2],
          withdraw: false,
          amount: deposit1.args[1],
          slot: deposit1.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: deposit2.args[2],
          withdraw: false,
          amount: deposit2.args[1],
          slot: deposit2.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: withdraw1.args[2],
          withdraw: true,
          amount: withdraw1.args[1],
          slot: withdraw1.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: withdraw2.args[2],
          withdraw: true,
          amount: withdraw2.args[1],
          slot: withdraw2.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingFeesPath,
          method: "post",
          slot: fees1.args[0],
          token: fees1.args[2],
          amount: fees1.args[1],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingFeesPath,
          method: "post",
          slot: fees2.args[0],
          token: fees2.args[2],
          amount: fees2.args[1],
          chain_id: parseInt(chainId),
        },
      ]) + "\n"
    );
  });

  test("Checks stacking entry new stacking & deposit & fees deposit api errors are handled well", async () => {
    const inspector = new Inspector(chainId);
    const initialBlock = 46;
    const actualBlock = 76;

    const deposit1 = {
      blockNumber: 78,
      args: ["45", "2345743", "deposit1Address"],
    };
    const deposit2 = {
      blockNumber: 78,
      args: ["slot", "amount", "deposit2Address"],
    };

    const withdraw1 = {
      blockNumber: 79,
      args: ["45", "2345743", "withdraw1Address"],
    };
    const withdraw2 = {
      blockNumber: 788,
      args: ["slot", "amount", "withdraw2Address"],
    };
    const fees1 = {
      blockNumber: 781,
      args: ["slot1", "feesAmount1", "feesToken1"],
    };
    const fees2 = {
      blockNumber: 784,
      args: ["slot2", "feesAmount2", "feesToken2"],
    };
    const fees1W = {
      blockNumber: 7811,
      args: ["slot1", "address1", ["feesToken11", "feesToken12"]],
    };
    const fees2W = {
      blockNumber: 7842,
      args: ["slot2", "address2", ["feesToken21", "feesToken22"]],
    };

    readFileMock.mockReturnValue(initialBlock);
    getBlockMock.mockReturnValue(
      new Promise((r) => r({ number: actualBlock }))
    );
    mockedAxios.post.mockReturnValue(<Promise<unknown>>(
      (<unknown>{ status: axios.HttpStatusCode.ServiceUnavailable })
    ));
    filterMock.mockReturnValueOnce([deposit1, deposit2]); //stack deposit
    filterMock.mockReturnValueOnce([withdraw1, withdraw2]); //stack withdraw
    filterMock.mockReturnValueOnce([fees1, fees2]); // fee deposit
    filterMock.mockReturnValueOnce([fees1W, fees2W]);

    await inspector.stackingAnalysis();
    expect(appendFileMock).toHaveBeenCalledWith(
      `blocks/stacking/errors.log`,
      JSON.stringify([
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: deposit1.args[2],
          withdraw: false,
          amount: deposit1.args[1],
          slot: deposit1.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: deposit2.args[2],
          withdraw: false,
          amount: deposit2.args[1],
          slot: deposit2.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: withdraw1.args[2],
          withdraw: true,
          amount: withdraw1.args[1],
          slot: withdraw1.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          address: withdraw2.args[2],
          withdraw: true,
          amount: withdraw2.args[1],
          slot: withdraw2.args[0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingFeesPath,
          method: "post",
          slot: fees1.args[0],
          token: fees1.args[2],
          amount: fees1.args[1],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingFeesPath,
          method: "post",
          slot: fees2.args[0],
          token: fees2.args[2],
          amount: fees2.args[1],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingFeesWithdrawalPath,
          method: "post",
          slot: fees1W.args[0],
          address: fees1W.args[1],
          token: fees1W.args[2][0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingFeesWithdrawalPath,
          method: "post",
          slot: fees1W.args[0],
          address: fees1W.args[1],
          token: fees1W.args[2][1],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingFeesWithdrawalPath,
          method: "post",
          slot: fees2W.args[0],
          address: fees2W.args[1],
          token: fees2W.args[2][0],
          chain_id: parseInt(chainId),
        },
        {
          path: apiUrl + stackingFeesWithdrawalPath,
          method: "post",
          slot: fees2W.args[0],
          address: fees2W.args[1],
          token: fees2W.args[2][1],
          chain_id: parseInt(chainId),
        },
      ]) + "\n"
    );
  });
});
