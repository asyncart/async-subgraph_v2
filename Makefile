.PHONY: install
install:
	yarn
	cd async-contracts; yarn

.PHONY: clear-data
clear-data:
	sudo rm -rf data ganache-data

.PHONY: graph-test
graph-test:
	./start-graph.sh

.PHONY: stop
stop:
	docker-compose down -v

.PHONY: restart-graph-test
restart-graph-test:
	make stop
	make graph-test
