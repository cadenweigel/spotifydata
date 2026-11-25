/**
 * Route table for the app. Every page sits inside AppLayout and shares the
 * dataset through DatasetProvider and the preferences through PrefsProvider.
 * Data, Graphs, and Analysis sit behind
 * RequireDataset. "/" is Main; unknown paths are NotFound.
 */

import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireDataset } from "@/components/layout/RequireDataset";
import { AnalysisPage } from "@/pages/AnalysisPage";
import { DataPage } from "@/pages/DataPage";
import { GraphsPage } from "@/pages/GraphsPage";
import { MainPage } from "@/pages/MainPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { DatasetProvider } from "@/state/DatasetProvider";
import { PrefsProvider } from "@/state/PrefsProvider";

/** Mounts the shared dataset, the preferences, and the routes. */
export default function App() {
  return (
    <PrefsProvider>
      <DatasetProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<MainPage />} />
            <Route element={<RequireDataset />}>
              <Route path="data" element={<Navigate to="/data/artists" replace />} />
              <Route path="data/:kind" element={<DataPage />} />
              <Route path="graphs" element={<GraphsPage />} />
              <Route path="analysis" element={<AnalysisPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </DatasetProvider>
    </PrefsProvider>
  );
}
