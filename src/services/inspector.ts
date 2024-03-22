import { ethers } from "ethers";
import {
  apiUrl,
  chainRPC,
  dexABI,
  dexContract,
  genesisBlock,
  stackingABI,
  stackingContract,
  stackingFeesPath,
  stackingFeesWithdrawalPath,
  stackingPath,
  watchTowerPath,
} from "../configs";
import { promises as fs } from "fs";
import axios from "axios";

/**
 * @notice Class used to inspect the blockchain events and send the data to the api
 */
export class Inspector {
  private _tradeLock = false;
  private _stackLock = false;
  private _provider;
  private _dexContract;
  private _stackingContract;

  constructor(private chainId: string) {
    const rpc = chainRPC[<keyof typeof chainRPC>this.chainId];
    const dexAddress = dexContract[<keyof typeof chainRPC>this.chainId];
    const stackingAddress =
      stackingContract[<keyof typeof chainRPC>this.chainId];
    this._provider = new ethers.JsonRpcProvider(rpc);
    this._dexContract = new ethers.Contract(dexAddress, dexABI, this.provider);
    this._stackingContract = new ethers.Contract(
      stackingAddress,
      stackingABI,
      this.provider
    );
  }

  public get provider() {
    return this._provider;
  }

  public get dexContract() {
    return this._dexContract;
  }

  public get stackingContract() {
    return this._stackingContract;
  }

  /**
   * @notice - Used to analayse the trade related event and send the data back to the API
   * @returns void
   */
  public async tradeAnalysis(): Promise<boolean> {
    if (this._tradeLock) return false;
    this._tradeLock = true;
    const errors: Object[] = [];
    try {
      const block = await this.getLastBlock("trade");
      const lastBlock = Math.min(
        Number((await this.provider.getBlock("latest"))?.number),
        block + 4000
      );

      const [tradeEvents, cancelEvents] = await Promise.all([
        this._dexContract.queryFilter("NewTrade", block, lastBlock),
        this._dexContract.queryFilter("Cancel", block, lastBlock),
      ]);

      tradeEvents.forEach(async (tradeEvent) => {
        if ("args" in tradeEvent) {
          const data = {
            taker: tradeEvent.args[0],
            block: tradeEvent.blockNumber,
            trades: {
              [tradeEvent.args[1]]: {
                amount: tradeEvent.args[2],
                fees: tradeEvent.args[3],
                base_fees: tradeEvent.args[4],
                is_buyer: !tradeEvent.args[5],
              },
            },
          };
          const path = apiUrl + watchTowerPath;
          const response = await axios.post(path, data);

          if (response.status != axios.HttpStatusCode.Ok) {
            errors.push({
              path: path,
              method: "post",
              chainId: this.chainId,
              ...data,
            });
          }
        }
      });

      cancelEvents.forEach(async (cancelEvent) => {
        if ("args" in cancelEvent) {
          const data = { orderHash: cancelEvent.args[0] };
          const path = apiUrl + watchTowerPath;
          const response = await axios.delete(apiUrl + watchTowerPath, {
            data: data,
          });

          if (response.status != axios.HttpStatusCode.Ok) {
            errors.push({
              path: path,
              method: "delete",
              chainId: this.chainId,
              ...data,
            });
          }
        }
      });
      await this.saveLastBlock(lastBlock, "trade");
    } catch (e: any) {
      console.log(
        `${new Date().toISOString()}: An error occured while trying to fetch the trade details ${e}`
      );
    } finally {
      await this.writeErrors(errors, "trade");
    }
    this._tradeLock = false;
    return true;
  }

  /**
   * @notice - Used to analayse the stacking related event and send the data back to the API
   * @returns void
   */
  public async stackingAnalysis(): Promise<boolean> {
    if (this._stackLock) return false;
    this._stackLock = true;
    const errors: Object[] = [];
    try {
      const block = await this.getLastBlock("stacking");
      const lastBlock = Math.min(
        Number((await this.provider.getBlock("latest"))?.number),
        block + 4000
      );

      const [
        stackingDepositEvents,
        stackingWithdrawalEvents,
        feesDepositEvents,
        feesWithdrawalEvents,
      ] = await Promise.all([
        this._stackingContract.queryFilter("NewStackDeposit", block, lastBlock),
        this._stackingContract.queryFilter(
          "NewStackWithdrawal",
          block,
          lastBlock
        ),
        this._stackingContract.queryFilter("NewFeesDeposit", block, lastBlock),
        this._stackingContract.queryFilter(
          "NewFeesWithdrawal",
          block,
          lastBlock
        ),
      ]);

      stackingDepositEvents.forEach(async (depositEvent) => {
        if ("args" in depositEvent) {
          const path = apiUrl + stackingPath;
          const data = {
            address: depositEvent.args[2],
            withdraw: false,
            amount: depositEvent.args[1],
            slot: depositEvent.args[0],
            chain_id: parseInt(this.chainId),
          };

          const response = await axios.post(path, data);
          if (response.status != axios.HttpStatusCode.Ok) {
            errors.push({
              path: path,
              method: "post",
              chainId: this.chainId,
              ...data,
            });
          }
        }
      });

      stackingWithdrawalEvents.forEach(async (withdrawEvent) => {
        if ("args" in withdrawEvent) {
          const path = apiUrl + stackingPath;
          const data = {
            address: withdrawEvent.args[2],
            withdraw: true,
            amount: withdrawEvent.args[1],
            slot: withdrawEvent.args[0],
            chain_id: parseInt(this.chainId),
          };

          const response = await axios.post(path, data);
          if (response.status != axios.HttpStatusCode.Ok) {
            errors.push({
              path: path,
              method: "post",
              chainId: this.chainId,
              ...data,
            });
          }
        }
      });

      feesDepositEvents.forEach(async (feeDepositEvent) => {
        if ("args" in feeDepositEvent) {
          const path = apiUrl + stackingFeesPath;
          const data = {
            slot: feeDepositEvent.args[0],
            token: feeDepositEvent.args[2],
            amount: feeDepositEvent.args[1],
            chain_id: parseInt(this.chainId),
          };
          const response = await axios.post(path, data);
          if (response.status != axios.HttpStatusCode.Ok) {
            errors.push({
              path: path,
              method: "post",
              chainId: this.chainId,
              ...data,
            });
          }
        }
      });

      feesWithdrawalEvents.forEach(async (feesWithdrawalEvent) => {
        if ("args" in feesWithdrawalEvent) {
          feesWithdrawalEvent.args[2].forEach(async (token: string) => {
            const path = apiUrl + stackingFeesWithdrawalPath;
            const data = {
              slot: feesWithdrawalEvent.args[0],
              address: feesWithdrawalEvent.args[1],
              token: token,
              chain_id: parseInt(this.chainId),
            };

            const response = await axios.post(path, data);
            if (response.status != axios.HttpStatusCode.Ok) {
              errors.push({
                path: path,
                method: "post",
                chainId: this.chainId,
                ...data,
              });
            }
          });
        }
      });
      await this.saveLastBlock(lastBlock, "stacking");
    } catch (e: any) {
      console.error(
        `${new Date().toISOString()}: An error occured while trying to fetch the stacking details ${e}`
      );
    }
    await this.writeErrors(errors, "stacking");
    this._stackLock = false;
    return true;
  }

  /**
   * @notice - Used to retrieve the last analyzed block from the file
   * @param name - the name of the section to get the last block from file (trade or stacking)
   * @returns
   */
  private async getLastBlock(name: string): Promise<number> {
    try {
      return Number(
        await fs.readFile(`blocks/${name}/${this.chainId}.txt`, "utf8")
      );
    } catch (e: any) {
      return genesisBlock[<keyof typeof chainRPC>this.chainId];
    }
  }

  /**
   * @notice - Function used to save the last block on the save file
   * @param block - The number of the last block analysed
   * @param name - The name of the section to save the block to (stacking or trade)
   */
  private async saveLastBlock(block: number, name: string): Promise<void> {
    try {
      await fs.writeFile(`blocks/${name}/${this.chainId}.txt`, String(block));
    } catch (e: any) {
      console.error(
        `${new Date().toISOString()}: An error occured while trying to write the new block ${e}`
      );
    }
  }

  /**
   * @notice - Used to log the failed request to the API in order to manually create them
   * @param errors - The array of the errors that happened
   * @param name - The of the type of the errors trade or stacking
   */
  private async writeErrors(errors: Object[], name: string): Promise<void> {
    if (!errors || !errors.length) return;
    await fs.appendFile(
      `blocks/${name}/errors.log`,
      JSON.stringify(errors) + "\n"
    );
  }
}
