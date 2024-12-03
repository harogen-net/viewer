import { Button } from "@mui/material";
import React from "react";

export const ConfigPanel: React.FC = () => {
  // const { config, setConfig } = useConfig();

  // const handleChange = (key: keyof Config, value: string) => {
  //   setConfig({ ...config, [key]: value });
  // };

  return (
    <div>
      <Button variant="contained" color="primary">
        Hello, MUI
      </Button>
    </div>
  );
};
