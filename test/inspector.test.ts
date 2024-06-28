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
import { signData } from "../src/services";

const chainId = "1337";
jest.mock("axios");
jest.mock("ethers");
jest.mock("fs");
jest.useFakeTimers();

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
      args: ["taker", "0x345", "456", "123", false, 1],
    };
    const trade2 = {
      blockNumber: 79,
      args: ["taker", "0x346", "457", "124", true, 0],
    };
    const cancel1 = { args: ["0x345", "baseToken", "quoteToken"] };
    const cancel2 = { args: ["0x346", "baseToken", "quoteToken"] };

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
      signData({
        taker: trade1.args[0],
        block: trade1.blockNumber,
        trades: {
          [String(trade1.args[1])]: {
            amount: trade1.args[2],
            fees: trade1.args[3],
            base_fees: trade1.args[4],
            is_buyer: !trade1.args[5],
          },
        },
      })
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      apiUrl + watchTowerPath,
      signData({
        taker: trade2.args[0],
        block: trade2.blockNumber,
        trades: {
          [String(trade2.args[1])]: {
            amount: trade2.args[2],
            fees: trade2.args[3],
            base_fees: trade2.args[4],
            is_buyer: !trade2.args[5],
          },
        },
      })
    );
    expect(mockedAxios.delete).toHaveBeenNthCalledWith(
      1,
      apiUrl + watchTowerPath,
      {
        data: signData({
          orderHash: cancel1.args[0],
          baseToken: cancel1.args[1],
          quoteToken: cancel1.args[2],
        }),
      }
    );
    expect(mockedAxios.delete).toHaveBeenNthCalledWith(
      2,
      apiUrl + watchTowerPath,
      {
        data: signData({
          orderHash: cancel2.args[0],
          baseToken: cancel2.args[1],
          quoteToken: cancel2.args[2],
        }),
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
      args: ["46", "356456", "deposit2Address"],
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

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      apiUrl + stackingPath,
      signData({
        address: deposit1.args[2],
        amount: deposit1.args[1],
        slot: deposit1.args[0],
        chain_id: parseInt(chainId),
        withdraw: false,
      })
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      apiUrl + stackingPath,
      signData({
        address: deposit2.args[2],
        amount: deposit2.args[1],
        slot: deposit2.args[0],
        chain_id: parseInt(chainId),
        withdraw: false,
      })
    );

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
      args: ["53", "123", "withdrawal2Address"],
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
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      apiUrl + stackingPath,
      signData({
        address: withdrawal1.args[2],
        amount: withdrawal1.args[1],
        slot: withdrawal1.args[0],
        chain_id: parseInt(chainId),
        withdraw: true,
      })
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      apiUrl + stackingPath,
      signData({
        address: withdrawal2.args[2],
        amount: withdrawal2.args[1],
        slot: withdrawal2.args[0],
        chain_id: parseInt(chainId),
        withdraw: true,
      })
    );

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
      args: ["345", "24563", "feesToken1"],
    };
    const fees2 = {
      blockNumber: 784,
      args: ["245", "5454", "feesToken2"],
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
      signData({
        token: fees1.args[2],
        amount: fees1.args[1],
        slot: fees1.args[0],
        chain_id: parseInt(chainId),
      })
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      apiUrl + stackingFeesPath,
      signData({
        token: fees2.args[2],
        amount: fees2.args[1],
        slot: fees2.args[0],
        chain_id: parseInt(chainId),
      })
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
      args: ["23", "address1", ["feesToken11", "feesToken12"]],
    };
    const fees2 = {
      blockNumber: 7842,
      args: ["42", "address2", ["feesToken21", "feesToken22"]],
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
      signData({
        address: fees1.args[1],
        token: fees1.args[2][0],
        slot: fees1.args[0],
        chain_id: parseInt(chainId),
      })
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      apiUrl + stackingFeesWithdrawalPath,
      signData({
        address: fees1.args[1],
        token: fees1.args[2][1],
        slot: fees1.args[0],
        chain_id: parseInt(chainId),
      })
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      3,
      apiUrl + stackingFeesWithdrawalPath,
      signData({
        address: fees2.args[1],
        token: fees2.args[2][0],
        slot: fees2.args[0],
        chain_id: parseInt(chainId),
      })
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      4,
      apiUrl + stackingFeesWithdrawalPath,
      signData({
        address: fees2.args[1],
        token: fees2.args[2][1],
        slot: fees2.args[0],
        chain_id: parseInt(chainId),
      })
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
      args: ["taker", "0x34566", "255727", "5727", true, 0],
    };
    const trade2 = {
      blockNumber: 79,
      args: ["taker", "0x35987", "425727", "2452", false, 0],
    };

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
          ...signData({
            taker: trade1.args[0],
            block: trade1.blockNumber,
            trades: {
              [String(trade1.args[1])]: {
                amount: trade1.args[2],
                fees: trade1.args[3],
                base_fees: trade1.args[4],
                is_buyer: !trade1.args[5],
              },
            },
          }),
        },
        {
          path: apiUrl + watchTowerPath,
          method: "post",
          chain_id: chainId,
          ...signData({
            taker: trade2.args[0],
            block: trade2.blockNumber,
            trades: {
              [String(trade2.args[1])]: {
                amount: trade2.args[2],
                fees: trade2.args[3],
                base_fees: trade2.args[4],
                is_buyer: !trade2.args[5],
              },
            },
          }),
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
      args: ["taker", "0x345", "65464", "651661", true, 1],
    };
    const trade2 = {
      blockNumber: 79,
      args: ["taker", "0x3456", "1545", "66656", true, 1],
    };
    const cancel1 = { args: ["0x345"] };
    const cancel2 = { args: ["0x3456"] };

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
          ...signData({
            taker: trade1.args[0],
            block: trade1.blockNumber,
            trades: {
              [String(trade1.args[1])]: {
                amount: trade1.args[2],
                fees: trade1.args[3],
                base_fees: trade1.args[4],
                is_buyer: !trade1.args[5],
              },
            },
          }),
        },
        {
          path: apiUrl + watchTowerPath,
          method: "post",
          chain_id: chainId,
          ...signData({
            taker: trade2.args[0],
            block: trade2.blockNumber,
            trades: {
              [String(trade2.args[1])]: {
                amount: trade2.args[2],
                fees: trade2.args[3],
                base_fees: trade2.args[4],
                is_buyer: !trade2.args[5],
              },
            },
          }),
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
      args: ["46", "87894", "deposit2Address"],
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
          ...signData({
            address: deposit1.args[2],
            amount: deposit1.args[1],
            slot: deposit1.args[0],
            chain_id: parseInt(chainId),
            withdraw: false,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: deposit2.args[2],
            amount: deposit2.args[1],
            slot: deposit2.args[0],
            chain_id: parseInt(chainId),
            withdraw: false,
          })
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
      args: ["797", "5424", "deposit2Address"],
    };

    const withdraw1 = {
      blockNumber: 79,
      args: ["45", "2345743", "withdraw1Address"],
    };
    const withdraw2 = {
      blockNumber: 788,
      args: ["43572", "453747", "withdraw2Address"],
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
          ...signData({
            address: deposit1.args[2],
            amount: deposit1.args[1],
            slot: deposit1.args[0],
            chain_id: parseInt(chainId),
            withdraw: false,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: deposit2.args[2],
            amount: deposit2.args[1],
            slot: deposit2.args[0],
            chain_id: parseInt(chainId),
            withdraw: false,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: withdraw1.args[2],
            amount: withdraw1.args[1],
            slot: withdraw1.args[0],
            chain_id: parseInt(chainId),
            withdraw: true,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: withdraw2.args[2],
            amount: withdraw2.args[1],
            slot: withdraw2.args[0],
            chain_id: parseInt(chainId),
            withdraw: true,
          })
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
      args: ["2545", "5273", "deposit2Address"],
    };

    const withdraw1 = {
      blockNumber: 79,
      args: ["45", "2345743", "withdraw1Address"],
    };
    const withdraw2 = {
      blockNumber: 788,
      args: ["4872", "43727", "withdraw2Address"],
    };
    const fees1 = {
      blockNumber: 781,
      args: ["2487", "425842", "feesToken1"],
    };
    const fees2 = {
      blockNumber: 784,
      args: ["4283", "45734", "feesToken2"],
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
          ...signData({
            address: deposit1.args[2],
            amount: deposit1.args[1],
            slot: deposit1.args[0],
            chain_id: parseInt(chainId),
            withdraw: false,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: deposit2.args[2],
            amount: deposit2.args[1],
            slot: deposit2.args[0],
            chain_id: parseInt(chainId),
            withdraw: false,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: withdraw1.args[2],
            amount: withdraw1.args[1],
            slot: withdraw1.args[0],
            chain_id: parseInt(chainId),
            withdraw: true,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: withdraw2.args[2],
            amount: withdraw2.args[1],
            slot: withdraw2.args[0],
            chain_id: parseInt(chainId),
            withdraw: true,
          })
        },
        {
          path: apiUrl + stackingFeesPath,
          method: "post",
          ...signData({
            token: fees1.args[2],
            amount: fees1.args[1],
            slot: fees1.args[0],
            chain_id: parseInt(chainId),
          })
        },
        {
          path: apiUrl + stackingFeesPath,
          method: "post",
          ...signData({
            token: fees2.args[2],
            amount: fees2.args[1],
            slot: fees2.args[0],
            chain_id: parseInt(chainId),
          })
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
      args: ["9872", "9468", "deposit2Address"],
    };

    const withdraw1 = {
      blockNumber: 79,
      args: ["45", "2345743", "withdraw1Address"],
    };
    const withdraw2 = {
      blockNumber: 788,
      args: ["3758", "743542", "withdraw2Address"],
    };
    const fees1 = {
      blockNumber: 781,
      args: ["2786", "15672", "feesToken1"],
    };
    const fees2 = {
      blockNumber: 784,
      args: ["2758", "344842", "feesToken2"],
    };
    const fees1W = {
      blockNumber: 7811,
      args: ["3787", "address1", ["feesToken11", "feesToken12"]],
    };
    const fees2W = {
      blockNumber: 7842,
      args: ["972733", "address2", ["feesToken21", "feesToken22"]],
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
          ...signData({
            address: deposit1.args[2],
            amount: deposit1.args[1],
            slot: deposit1.args[0],
            chain_id: parseInt(chainId),
            withdraw: false,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: deposit2.args[2],
            amount: deposit2.args[1],
            slot: deposit2.args[0],
            chain_id: parseInt(chainId),
            withdraw: false,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: withdraw1.args[2],
            amount: withdraw1.args[1],
            slot: withdraw1.args[0],
            chain_id: parseInt(chainId),
            withdraw: true,
          })
        },
        {
          path: apiUrl + stackingPath,
          method: "post",
          ...signData({
            address: withdraw2.args[2],
            amount: withdraw2.args[1],
            slot: withdraw2.args[0],
            chain_id: parseInt(chainId),
            withdraw: true,
          })
        },
        {
          path: apiUrl + stackingFeesPath,
          method: "post",
          ...signData({
            token: fees1.args[2],
            amount: fees1.args[1],
            slot: fees1.args[0],
            chain_id: parseInt(chainId),
          })
        },
        {
          path: apiUrl + stackingFeesPath,
          method: "post",
          ...signData({
            token: fees2.args[2],
            amount: fees2.args[1],
            slot: fees2.args[0],
            chain_id: parseInt(chainId),
          })
        },
        {
          path: apiUrl + stackingFeesWithdrawalPath,
          method: "post",
          ...signData({
            address: fees1W.args[1],
            token: fees1W.args[2][0],
            slot: fees1W.args[0],
            chain_id: parseInt(chainId),
          })
        },
        {
          path: apiUrl + stackingFeesWithdrawalPath,
          method: "post",
          ...signData({
            address: fees1W.args[1],
            token: fees1W.args[2][1],
            slot: fees1W.args[0],
            chain_id: parseInt(chainId),
          })
        },
        {
          path: apiUrl + stackingFeesWithdrawalPath,
          method: "post",
          ...signData({
            address: fees2W.args[1],
            token: fees2W.args[2][0],
            slot: fees2W.args[0],
            chain_id: parseInt(chainId),
          })
        },
        {
          path: apiUrl + stackingFeesWithdrawalPath,
          method: "post",
          ...signData({
            address: fees2W.args[1],
            token: fees2W.args[2][1],
            slot: fees2W.args[0],
            chain_id: parseInt(chainId),
          })
        },
      ]) + "\n"
    );
  });
});
