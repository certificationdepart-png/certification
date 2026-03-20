-- Allow deleting a school (cascades to Course) when applications still reference those courses.
ALTER TABLE "ApplicationCourse" DROP CONSTRAINT "ApplicationCourse_courseId_fkey";

ALTER TABLE "ApplicationCourse"
ADD CONSTRAINT "ApplicationCourse_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
