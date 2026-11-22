import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AnalysisPage } from "@/pages/AnalysisPage";
import { DataPage } from "@/pages/DataPage";
import { GraphsPage } from "@/pages/GraphsPage";
import { MainPage } from "@/pages/MainPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { DatasetProvider } from "@/state/DatasetProvider";

export default function App() {
  return (
    <DatasetProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<MainPage />} />
          <Route path="data" element={<Navigate to="/data/artists" replace />} />
          <Route path="data/:kind" element={<DataPage />} />
          <Route path="graphs" element={<GraphsPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </DatasetProvider>
  );
}
