# Bật/tắt cả cụm local: Supabase (CLI) + Kafka/Redis (compose)
.PHONY: up down status infra-up infra-down db-reset worker web

up: infra-up            ## bật Kafka/Redis rồi Supabase local
	npx supabase start

down:                   ## tắt tất cả
	-npx supabase stop
	cd infra && docker compose down

status:                 ## xem URL + key của Supabase local
	npx supabase status

infra-up:               ## chỉ bật Kafka + Redis
	cd infra && docker compose up -d

infra-down:
	cd infra && docker compose down

db-reset:               ## áp lại migration vào Supabase local
	npx supabase db reset

worker:                 ## chạy worker crawl (giữ tiến trình sống)
	cd worker && python run.py

web:                    ## chạy UI dev
	cd web && npm run dev
