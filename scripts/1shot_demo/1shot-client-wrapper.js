// Dynamically import the ESM module
export const loadOneShotClient = async () => {
    const OneShotClientModule = await import('@uxly/1shot-client');
    return { ...OneShotClientModule };
  };