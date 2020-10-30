#!/bin/bash

######################
####### CONFIG #######
######################
RPC_ENDPOINT="http://localhost:8545"
TOTAL_WAITING_TIME=200 # seconds
WAIT_FOR_INPUT=true
ROOT_DIR=$(pwd)
######################

function killCompose {
    cd $ROOT_DIR
    docker-compose down -v
}

function killAndExit {
    echo "####### EXITING... #######"
    killCompose
    exit 0
}

function graphCreate {
    echo '####### DEPLOYING GRAPH #######'
    yarn codegen 
    echo '####### GRAPH CODE GENERATED #######'        
    yarn create-local
    echo '####### GRAPH LOCAL CREATED #######'
    yarn deploy-local          
    echo '####### GRAPH LOCAL DEPLOYED #######'
    if [ "$?" -ne 0 ];
    then
        echo "ERROR: Could not deploy graph successfully - try fix error and redeploy"
    fi
}

function graphRedeploy {
    echo '####### REDEPLOYING GRAPH #######'
    yarn codegen && yarn deploy-local
    if [ "$?" -ne 0 ];
    then
        echo "ERROR: Could not redeploy graph successfully"
    fi
}

function doneLoop {
    echo "######################"
    echo "######## DONE ########"
    if [ $WAIT_FOR_INPUT = true ]; then
        echo "####### PRESS R to RESTART ######"
        echo "# PRESS G to REDEPLOY the graph #"
        echo "######## PRESS Q to QUIT ########"
    fi
    echo "######################"
    if [ $WAIT_FOR_INPUT = true ]; then
        waitForInput
    fi
}

function start {
    echo "####### CLEANUP #######"
    sudo rm -rf data ganache-data

    echo "####### DOCKER-COMPOSE #######"
    docker-compose up 2>&1 > /dev/null &
    DOCKER_COMPOSE_UP_PID=$!

    echo "####### WAITING FOR DOCKERS #######"
    WAITING_TIME=0
    until $(curl --output /dev/null -X POST --silent --fail -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' $RPC_ENDPOINT); do
        SLEEP_AMOUNT=3
        sleep $SLEEP_AMOUNT
        WAITING_TIME=$(($WAITING_TIME+$SLEEP_AMOUNT))
        if [ "$WAITING_TIME" -gt "$TOTAL_WAITING_TIME" ];
        then
            echo "ERROR: Could not reach ETH chain"
            killAndExit
        fi;
    done

    echo "####### DEPLOYING CONTRACTS #######"
    cd ./async-contracts && truffle migrate --reset --network graphTesting
    if [ "$?" -ne 0 ];
    then
        echo "ERROR: Could not deploy contracts successfully"
        # killAndExit
    fi
    cd ..

    sleep 5 ## Sometimes it takes a bit longer for the graph to be ready.
    graphCreate
    doneLoop
}

function waitForInput {
    while [ true ] ; do
        read -n 1 k <&1
        if [[ $k == "q" || $k == "Q" ]]; then
            echo ""
            killAndExit
        elif [[ $k == "r" || $k == "R" ]]; then
            echo ""
            echo "######## RESTARTING ALL ########"
            killCompose
            sleep 3
            start
        elif [[ $k == "g" || $k == "G" ]]; then
            echo ""
            graphRedeploy
            doneLoop
        fi
    done
}

start
