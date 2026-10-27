ALTER TABLE "OpsSchedule" ADD COLUMN "intervalWeeks" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "OpsSchedule" ADD CONSTRAINT "OpsSchedule_intervalWeeks_check" CHECK ("intervalWeeks" BETWEEN 1 AND 4);
