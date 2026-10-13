/** אתר ועוזר משתמשים באותו ספק; רק המתאם הזה קורא את נתוני הבנייה המקומיים. */
import modelFile from "../data/model.json";
import { polls, meta, lists2026 } from "./data";
import { createDataProvider } from "./dataResolverCore";
export { sourceOptions, reconstructPoll, adjustedAverage, createDataProvider } from "./dataResolverCore";
export type { Selection, SourceOption, DataResult, Reconstruction } from "./dataResolverCore";
export const { MODEL_AVERAGE, DATA_AS_OF, SNAPSHOT_ID, CURRENT_POLLS, SIMPLE_POLL_MEANS, SOURCE_OPTIONS, ADJUSTED_AVERAGE, resolveData, resolveDataset, resolveBloc, resolveSupport, resolveSupportMetric, resolveMetric, selectedPolls } = createDataProvider({ polls, meta, lists2026, model: modelFile });
