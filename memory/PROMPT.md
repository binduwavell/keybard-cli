# Prompt Engineering for KeyBard CLI

## Execute test related tasks

Work through the incomplete (unchecked) tasks in @memory/TODO.md . Consider guidance from @README.md and /memory/TODO.md.

It is important that we maintain comprehensive happy and sad path tests for all code. Consider the testing guidance in @memory/test/TESTING_BEST_PRACTICES.md and the code in @test/test-helpers.js .

- If there are multiple consecutive tasks that apply the same change to a list of files
  - See if you can create a script to perform the updates to all the relevant files in one shot
  - If it is not possible to script the changes, complete one task at a time
  - Make sure tests are adjusted appropriately
  - Make sure memories are adjusted appropriately
  - Make sure documentation is adjusted appropriately

- After completing a task
  - Make sure that all tests are passing (`npm test`)
  - Mark the task as complete in /memory/TODO.md
  - Proceed to the next incomplete task in /memory/TODO.md
