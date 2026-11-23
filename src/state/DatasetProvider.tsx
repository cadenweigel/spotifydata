/**
 * Holds the loaded dataset for every page. This is a stub: status is always
 * "empty" until an upload can be stored here.
 */

import { createContext, type ReactNode } from "react";

type DatasetStatus = "empty";

type DatasetContextValue = {
  status: DatasetStatus;
};

const DatasetContext = createContext<DatasetContextValue>({
  status: "empty",
});

type DatasetProviderProps = {
  children: ReactNode;
};

/** Makes the dataset status available to every route underneath it. */
export function DatasetProvider({ children }: DatasetProviderProps) {
  return (
    <DatasetContext.Provider value={{ status: "empty" }}>
      {children}
    </DatasetContext.Provider>
  );
}
