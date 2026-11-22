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

export function DatasetProvider({ children }: DatasetProviderProps) {
  return (
    <DatasetContext.Provider value={{ status: "empty" }}>
      {children}
    </DatasetContext.Provider>
  );
}
