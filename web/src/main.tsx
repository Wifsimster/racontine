import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App";
import Login from "./pages/Login";
import Timeline from "./pages/Timeline";
import Capture from "./pages/Capture";
import Review from "./pages/Review";
import Proches from "./pages/Proches";

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Timeline /> },
      { path: "capture", element: <Capture /> },
      { path: "entries/:id", element: <Review /> },
      { path: "proches", element: <Proches /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
