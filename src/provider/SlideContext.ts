import React, { createContext } from "react";
import { Slide } from "../model/Slide";

export const SlideContext = createContext(
  {} as {
    slide: Slide;
    setSlide: React.Dispatch<React.SetStateAction<Slide>>;
  }
);

