After cloning initialise the contracts needed for testing and installing dependancies run:

```bash
git submodule update --init --recursive
yarn && cd async-contracts && yarn && cd ..
```

### Local development and testing

Run:

```bash
make graph-test
```
