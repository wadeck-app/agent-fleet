# FlowFeedbackController & FlowFeedbackRepository Test Review

## Date: 2026-03-13

### Key Findings

#### FlowFeedbackController Test File
- Status: INSUFFICIENT - Critical gap on `getFeedbackForFlow` method
- The controller test does NOT cover `FlowFeedbackService.getFeedbackForFlow()` at all
- FlowsController (line 87-88) uses `flowFeedbackService.getFeedbackForFlow(params.flowId)` but this is only tested in FlowFeedbackService.test.ts
- The mock service in FlowFeedbackController.test.ts includes `getFeedbackForFlow` (line 18), but no test ever exercises it
- This is a coverage gap: the handler in FlowsController that calls this method is untested in the context of controller routing

#### FlowFeedbackRepository Test File
- Status: SUFFICIENT - Good comprehensive coverage
- All 5 public methods tested: create, findByTicketId, findByFlowId, createRetrospective, findRetrospectiveByTicketId
- Edge cases covered: empty results, multiple entries, collection isolation
- One questionable test: lines 287-300 test "at-most-one invariant" but only verify first item is not null, not which one is returned

#### Architecture Detail
- FlowFeedbackService contains the business logic (validation, ID generation, ticket updates)
- FlowFeedbackService is tested separately and comprehensively
- FlowFeedbackController is a presentation layer that only delegates to service
- FlowsController also uses the FlowFeedbackService for GET /api/flows/:flowId/feedback

### Redundancies
- FlowFeedbackController test lines 175-184 and 213-222: Both test "returns X from service" - property-level assertions duplicate the delegation test
- FlowFeedbackController test lines 151-156: "registers exactly 3 routes" is redundant with the 3 specific route registration tests

### Next Steps
- Add controller test for `getFeedbackForFlow` in FlowFeedbackController scope (even though the route is in FlowsController)
- Review if FlowsController should have its own test file covering all 5 routes it registers
