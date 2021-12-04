import { useState, useCallback, useContext, useEffect } from "react";
import type {
  AxiosError,
  CancelTokenSource,
  Canceler,
  CancelToken,
  AxiosResponse,
} from "axios";
import axios from "axios";
import type {
  RequestFactory,
  Request,
  Payload,
  CData,
  AxiosRestResponse,
} from "./request";
import { createRequestError } from "./request";
import { RequestContext } from "./requestContext";

import { useMountedState, useRefFn } from "./utils";

const REQUEST_AXIOS_INSTANCE_MESSAGE =
  "react-request-hook requires an Axios instance to be passed through context via the <RequestProvider>";

export type UseRequestResult<TRequest extends Request> = [
  RequestFactory<TRequest>,
  {
    hasPending: boolean;
    clear: Canceler;
  },
];

export function useRequest<TRequest extends Request>(
  fn: TRequest,
): UseRequestResult<TRequest> {
  const getMountedState = useMountedState();
  const RequestConfig = useContext(RequestContext);
  const axiosInstance = RequestConfig.instance;
  const customCreateReqError = RequestConfig.customCreateReqError;

  if (!axiosInstance) {
    throw new Error(REQUEST_AXIOS_INSTANCE_MESSAGE);
  }

  const [sources, setSources] = useState<CancelTokenSource[]>([]);
  const hasPending = sources.length > 0;

  const removeCancelToken = useCallback(
    (cancelToken: CancelToken) => {
      if (getMountedState()) {
        setSources((prevSources) =>
          prevSources.filter((source) => source.token !== cancelToken),
        );
      }
    },
    [getMountedState],
  );

  const callFn = useRefFn(fn);

  const request = useCallback(
    (...args: Parameters<TRequest>) => {
      const config = callFn.current(...args);
      const source = axios.CancelToken.source();

      const ready = () => {
        if (getMountedState()) {
          setSources((prevSources) => [...prevSources, source]);
        }
        return axiosInstance({ ...config, cancelToken: source.token })
          .then(
            (response: AxiosResponse<Payload<TRequest>, CData<TRequest>>) => {
              removeCancelToken(source.token);
              const { data, ...restResponse } = response;
              return [data, restResponse];
            },
          )
          .catch((error: AxiosError<Payload<TRequest>, CData<TRequest>>) => {
            removeCancelToken(source.token);

            if (customCreateReqError) {
              throw customCreateReqError(error);
            } else {
              throw createRequestError(error);
            }
          }) as Promise<
          [Payload<TRequest>, AxiosRestResponse<CData<TRequest>>]
        >;
      };

      return {
        ready,
        cancel: source.cancel,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axiosInstance, customCreateReqError, getMountedState, removeCancelToken],
  );

  const clear = useCallback(
    (message?: string) => {
      if (sources.length > 0) {
        sources.map((source) => source.cancel(message));
        if (getMountedState()) {
          setSources([]);
        }
      }
    },
    [getMountedState, sources],
  );

  const clearRef = useRefFn(clear);

  const rtnClearFn = useCallback(
    (message?: string) => clearRef.current(message),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    return clearRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [request, { clear: rtnClearFn, hasPending }];
}
