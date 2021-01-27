# Welcome to the official subgraph for https://async.art/ 😀

Navigate to: https://thegraph.com/explorer/subgraph/asyncart/async-art-v2

Where you can run a number of expressive queries! You can view a number of example queries in the left corner of the query explorer.

E.g. Who are the top 5 users with most sales? 🤔
-> https://thegraph.com/explorer/subgraph/asyncart/async-art-v2?query=Top%205%20users%20with%20highest%20total%20sale%20amount



## How to contribute 
After cloning, initialise the contracts submodule needed for testing and installing dependancies run:

```bash
git submodule update --init --recursive
yarn && cd async-contracts && yarn && cd ..
```

### Local development and testing
Make sure you have docker installed and then simply run the script below.

This will set up a complete local development enviroment.

```bash
make graph-test
```
You can navigate to https://localhost:8000 for queries!

Have technical questions or difficulties? Just pop an email to jonjon@wildcards.world
