// Very high value for slow travis...
if (process.env.TRAVIS === 'true') {
  jest.setTimeout(60000);
}
