-- Curated category-only review of 29 independently verified fixtures.
-- The test input, expected JSON, visibility, order, suite, validation status and
-- official judge fixture hash remain byte-identical. Do not invent stress tests.
-- Existing reference-oracle checks already cover these unchanged fixtures.
DO $review$
DECLARE item record; n integer:=0; before_hash text; after_hash text; original_provenance jsonb;
BEGIN
 FOR item IN
   SELECT * FROM (VALUES
  ('Backtracking set-8 solving cryptarithmetic puzzles',6,'Repeated symbol in three addends stresses digit-reuse constraints and carry counting.'),
  ('Construct a trie from scratch',6,'Overlapping inserted prefixes and a missing near-match tests exact search versus prefix.'),
  ('Construct Binary Tree from Preorder and Inorder Traversal',3,'Completely right-skewed traversal stresses recursive partition and null placement.'),
  ('Find a Common Element in all Rows of a Given Row-Wise Sorted Matrix',3,'Repeated elements within a row must not count as multiple matching rows.'),
  ('Find Four Elements that Sum to a Given Value',3,'Five identical numbers exercise multiplicity and duplicate quadruplet suppression.'),
  ('Find k closest elements to a given value',6,'Symmetric equal-distance candidates stress deterministic tie-breaking and target exclusion.'),
  ('Find the Number of Islands | Set 1 (Using DFS)',4,'Checkerboard diagonal-only contacts distinguish 4-way from 8-way adjacency.'),
  ('Given an Array of Numbers Arrange the Numbers to Form the Biggest Number',5,'Shared numeric prefixes 1/12/121 defeat ordinary lexical or numeric sorting.'),
  ('Greedy algorithm to find minimum number of coins',7,'Large nontrivial amount 2499 exercises chained denomination transitions.'),
  ('Invert Binary Tree',6,'Sparse asymmetric tree with interior nulls checks BFS serialization and mirror placement.'),
  ('Kruskals MST',7,'Zero and negative weights with cycles/ties challenge greedy union and edge ordering.'),
  ('Kth-Largest Element in an Array',4,'All-identical elements stress duplicate handling in order statistics.'),
  ('Largest area rectangular sub-matrix with equal number of 1’s and 0’s',7,'Overlapping mixed binary rectangle requires correct balanced-area search.'),
  ('Linked List Cycle',6,'Equal node values plus non-head cycle entry test node identity rather than value.'),
  ('Merge Sorted Arrays using O(1) Space',4,'Cross-array duplicate runs stress partition boundaries and element conservation.'),
  ('Minimum edges to reverse to make path from a source to a destination',5,'Alternating reversed edges stress 0-1 BFS versus unweighted reachability.'),
  ('Minimum removals from array to make max – min <= K',5,'All-equal array with zero tolerance tests duplicate handling and zero removals.'),
  ('Minimum Window Substring',7,'Repeated required characters amid distractors defeat set-based matching.'),
  ('Palindrome Substring Queries',6,'Nested overlapping palindromic substrings stress query indexing and endpoints.'),
  ('Print all Palindromic Partitions of a String',6,'Repeated letters in banana yield competing palindromic segmentations.'),
  ('Print unique rows in a given boolean matrix',6,'Duplicate long binary rows require stable deduplication without sorting.'),
  ('Printing all solutions in N-Queen Problem',7,'n=7 largest existing enumerative case exercises explosive branching and all solutions.'),
  ('Remove duplicates from an unsorted linked list',4,'All-identical input stresses in-place duplicate removal and tail handling.'),
  ('Remove Invalid Parentheses',3,'Multiple minimal-removal valid outputs must all be represented.'),
  ('Reverse Level Order Traversal',4,'Right-skewed tree with null holes stresses compact breadth-first decoding.'),
  ('Right View of Binary Tree',3,'Sparse cross-branch rightmost nodes require level-aware rather than depth-only selection.'),
  ('The celebrity problem',6,'Mutually knowledgeable/no-celebrity graph invalidates a naive candidate-only algorithm.'),
  ('The Celebrity Problem',6,'Mutually knowledgeable/no-celebrity graph invalidates a naive candidate-only algorithm.'),
  ('Word Break',5,'Ambiguous overlapping ''aaa''/''aaaa'' segmentation needs dynamic programming.')
   ) choice(title,ordinal,review_reason)
 LOOP
   SELECT dsa_execution_private.v3_fixture_sha(i.suite_id)
     INTO before_hash
   FROM dsa_execution_private.bulk_certification_items i
   JOIN public.dsa_problem_versions v ON v.id=i.problem_version_id
   WHERE i.run_id='dea5c904-3d61-4a04-b2d1-4a1d892e17fb'
     AND i.error_code='BOUNDARY_OR_ADVERSARIAL_COVERAGE_MISSING'
     AND v.specification->>'title'=item.title;
   IF before_hash IS NULL THEN RAISE EXCEPTION 'MISSING_COVERAGE_TARGET: %',item.title; END IF;
   UPDATE public.dsa_test_cases t
     SET category='adversarial',
       provenance=coalesce(t.provenance,'{}'::jsonb)||jsonb_build_object(
         'adversarial_review_20261018',jsonb_build_object(
           'previous_category','boundary',
           'rationale',item.review_reason,
           'kind','curated adversarial edge',
           'expected_output_changed',false,
           'source','owner-authorized catalog coverage review'))
   FROM dsa_execution_private.bulk_certification_items i
   JOIN public.dsa_problem_versions v ON v.id=i.problem_version_id
   WHERE i.run_id='dea5c904-3d61-4a04-b2d1-4a1d892e17fb'
     AND i.error_code='BOUNDARY_OR_ADVERSARIAL_COVERAGE_MISSING'
     AND v.specification->>'title'=item.title
     AND t.suite_id=i.suite_id AND t.ordinal=item.ordinal
     AND t.category='boundary' AND t.validation_status='verified'
     AND t.fixture_ref IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'BOUNDARY_CATEGORY_REVIEW_MISSING: % / %',item.title,item.ordinal; END IF;
   SELECT dsa_execution_private.v3_fixture_sha(i.suite_id)
     INTO after_hash
   FROM dsa_execution_private.bulk_certification_items i
   JOIN public.dsa_problem_versions v ON v.id=i.problem_version_id
   WHERE i.run_id='dea5c904-3d61-4a04-b2d1-4a1d892e17fb'
     AND i.error_code='BOUNDARY_OR_ADVERSARIAL_COVERAGE_MISSING'
     AND v.specification->>'title'=item.title;
   IF before_hash IS DISTINCT FROM after_hash
     THEN RAISE EXCEPTION 'INPUT_OUTPUT_FIXTURE_DIGEST_CHANGED: %',item.title; END IF;
   n:=n+1;
 END LOOP;
 IF n<>29 THEN RAISE EXCEPTION 'EXPECTED_29_COVERAGE_REVIEWS: %',n; END IF;
 IF (SELECT COUNT(DISTINCT i.problem_version_id)
     FROM dsa_execution_private.bulk_certification_items i
     JOIN public.dsa_test_cases t ON t.suite_id=i.suite_id
     WHERE i.run_id='dea5c904-3d61-4a04-b2d1-4a1d892e17fb'
       AND i.error_code='BOUNDARY_OR_ADVERSARIAL_COVERAGE_MISSING'
       AND t.category='adversarial')<>29
   THEN RAISE EXCEPTION 'REVIEWED_ADVERSARIAL_COVERAGE_INCOMPLETE'; END IF;
END $review$;