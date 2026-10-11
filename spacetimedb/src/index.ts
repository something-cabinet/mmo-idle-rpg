// Module entry point. Every named export must be a reducer or view; the
// default export must be the schema.
import { spacetimedb } from './schema';

export default spacetimedb;

export * from './reducers/account';
export * from './reducers/character';
export * from './reducers/chat';
export * from './reducers/loot';
export * from './reducers/equipment';
export * from './reducers/crafting';
export * from './reducers/views';
