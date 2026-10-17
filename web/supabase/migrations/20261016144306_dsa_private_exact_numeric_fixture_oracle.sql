-- Exact-arithmetic repair oracle for historical DSA fixtures rounded during JSON ingestion.
-- Operates on the *stored* integer values, not the pre-import value guesses.
-- Private schema, invoker privileges, bounded loops. Does not alter fixtures.
create or replace function dsa_execution_private.exact_numeric_fixture_expected_20261016(
  p_problem_number integer,
  p_input jsonb
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  n integer;
  k integer;
  i integer;
  a numeric := 1;
  b numeric := 1;
  c numeric := 1;
  value_numeric numeric;
  count_result integer := 0;
begin
  case p_problem_number
    when 336 then
      n := (p_input->>'n')::integer;
      if n < 0 or n > 2000 then raise exception 'Out of bound stair count'; end if;
      if n <= 1 then return to_jsonb(1::numeric); end if;
      for i in 2..n loop
        c := a+b;
        a := b;
        b := c;
      end loop;
      return to_jsonb(b);
    when 337 then
      n := (p_input->>'n')::integer;
      k := (p_input->>'k')::integer;
      if n < 0 or n > 200 or k < 0 or k > n then raise exception 'Out of bound permutation'; end if;
      c := 1;
      if k > 0 then
        for i in (n-k+1)..n loop
          c := c*i;
        end loop;
      end if;
      return to_jsonb(c);
    when 353 then
      n := (p_input->>'n')::integer;
      if n < 0 or n > 150 then raise exception 'Out of bound Catalan'; end if;
      c := 1;
      if n > 0 then
        for i in 1..n loop
          c := c*(4*i-2)/(i+1);
        end loop;
      end if;
      return to_jsonb(c);
    when 388 then
      value_numeric := (p_input->>'n')::numeric;
      if value_numeric < 0 or value_numeric <> trunc(value_numeric) then raise exception 'Invalid bit count input'; end if;
      while value_numeric > 0 loop
        if mod(value_numeric,2)=1 then count_result := count_result + 1; end if;
        value_numeric := trunc(value_numeric/2);
      end loop;
      return to_jsonb(count_result);
    when 391 then
      value_numeric := (p_input->>'n')::numeric;
      if value_numeric < 0 or value_numeric <> trunc(value_numeric) then raise exception 'Invalid bit position input'; end if;
      if value_numeric = 0 then return to_jsonb(-1);end if;
      count_result := 1;
      while value_numeric > 1 and mod(value_numeric,2)=0 loop
        value_numeric := trunc(value_numeric/2);
        count_result := count_result + 1;
      end loop;
      return to_jsonb(case when value_numeric=1 then count_result else -1 end);
    else
      raise exception 'Unsupported integer oracle %',p_problem_number;
  end case;
end $$;
