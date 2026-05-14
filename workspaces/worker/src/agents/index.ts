import { Layer } from "effect";
import { GeneralAgent } from "./general";

export const Agents = Layer.mergeAll(GeneralAgent.layer);
