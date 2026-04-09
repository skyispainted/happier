export type { RpcErrorCode } from '@ks-happier/protocol/rpc';
export {
  createRpcCallError,
  isRpcMethodNotAvailableError,
  isRpcMethodNotFoundError,
  readRpcErrorCode,
  RpcError,
  type RpcErrorCarrier,
} from '@ks-happier/protocol/rpcErrors';
